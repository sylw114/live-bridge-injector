const serverUrl = '' // 直播间地址
const waitTime = 2000 // 等待时间 单位毫秒 建议根据设备情况选择，尽可能保证能加载完成
const debug = false

function sendMsg(msg: Danmu | Gift | Jian | ComboGifts | SuperChat | GiftBox) {
  const str = JSON.stringify(msg)
  if (debugLevel < logLevel.warn)
    console.log("发送消息：", str)
  fetch(serverUrl, { method: 'POST', body: str, headers: { 'Content-Type': 'application/json' } })
}

type Gift = { type: "gift", gift: string, giftCount: number, userName: string }
type ComboGifts = ({ count: number } | { totalCount: number }) & { type: 'giftCombo'; userName: string; giftName: string; fansMedal?: { level: number; name: string } }
type GiftBox = { type: 'giftBox', boxName: string, userName: string, fansMedal?: { level: number, name: string }, giftName: string, giftCount: number }
type Message = ({ type: "text", text: string } | { type: "img", url: string, name?: string })[]
type Danmu = { type: 'danmu', username: string, message: Message, fansMedal?: { level: number, name: string } }
type Jian = { type: 'captain', userName: string }
type SuperChat = { type: 'superChat', userName: string, price: number, message: string }
enum logLevel {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3,
  none = 4
}

const debugLevel = logLevel.warn

setTimeout(main, waitTime)

function fault(faultInfomation: [string, number]) {
  if (!debug) return
  if (faultInfomation[0] === '') return
  faultStorages.push(faultInfomation)
  if (debugLevel < logLevel.error)
    console.log(faultInfomation)
}

function parseContent(node: Node, type?: number): Message {
  const message: Message = []
  for (const childNode of Array.from(node.childNodes)) {
    if (childNode.nodeType === Node.TEXT_NODE) {
      // 直接文本节点
      const text = childNode.textContent?.trim() ?? ""
      if (text) {
        message.push({ type: "text", text: text })
      }
    } else if (childNode.nodeType === Node.ELEMENT_NODE) {
      const element = childNode as HTMLElement
      if (element.tagName.toLowerCase() === 'span') {
        // span标签可能是图片或文本
        const firstChild = element.firstElementChild
        if (firstChild && firstChild.tagName.toLowerCase() === 'img') {
          // 这是一个图片span，包含img和alt文本
          const img = firstChild as HTMLImageElement
          message.push({ type: "img", url: img.src, name: img.alt })
        } else {
          // 这是一个文本span
          if (element.childNodes[0]?.nodeType !== Node.TEXT_NODE) fault([element.innerHTML, type ?? 0])
          const text = element.textContent?.trim() ?? ''
          if (text) {
            message.push({ type: "text", text: text })
          }
        }
      }
    }
  }
  return message
}

const faultStorages: [string, number][] = []

function main() {
  const giftsPrompt = document.getElementById("brush-prompt")!
  const config = { childList: true };
  const callback: MutationCallback = function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        for (const node of Array.from(mutation.addedNodes)) {  // 将 NodeList 转换为数组
          if (node.nodeType !== Node.ELEMENT_NODE) { fault([node.nodeName + node.nodeType, -1]); continue }
          if (!(node instanceof HTMLElement)) { fault([node.nodeName + node.nodeType, -1]); continue }
          const texts = node.innerText.split("\n")
          if (texts.length === 2 || texts.length === 4 && (texts[3] === "光临直播间" || texts[3] === "进入直播间" || texts[3] === "为主播点赞了")) {
            continue
          }
          if (/combo/.test((node.firstChild as HTMLElement).className)) continue// 没有用户信息我很难办啊！
          if (texts.length === 1 || texts[1] !== "投喂" || texts.length > 4) {
            fault([node.innerHTML, 1])
            continue
          }
          const gift: Gift = {
            type: "gift",
            gift: texts[2],
            userName: texts[0],
            giftCount: +(/\d+/.exec(texts[3])?.[0] ?? 1),
          }
          sendMsg(gift)
        }
      }
    }
  };
  const observer = new MutationObserver(callback)
  observer.observe(giftsPrompt, config);



  const danmu = document.getElementById("chat-items")!
  const danmuCallback: MutationCallback = function (mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        for (const node of Array.from(mutation.addedNodes)) {  // 将 NodeList 转换为数组
          if (node.nodeType !== Node.ELEMENT_NODE) { fault([(node as HTMLElement).outerHTML + (node as HTMLElement).innerHTML + node.nodeType, -1]); continue }
          if (!(node instanceof HTMLElement)) { fault([(node as HTMLElement).outerHTML + (node as HTMLElement).innerHTML + node.nodeType, -1]); continue }
          if (/superChat/.test(node.className)) {
            const child = node.children as HTMLCollectionOf<HTMLDivElement>;
            const price = +/(\d+)/.exec(child[0].innerText)![0] / 10;
            const uname = child[1].innerText;
            const text = child[2].innerText;
            const data: SuperChat = {
              type: 'superChat',
              price,
              userName: uname,
              message: text
            }
            sendMsg(data)
            continue
          }
          if(/恭喜用户.*荣耀等级/.test(node.innerText)) continue
          if(node.children.length === 1 && node.childNodes.length === 2 && node.childNodes[1].nodeType === Node.TEXT_NODE && /开通了舰长/.test(node.childNodes[1].textContent??'')){
            const name = (node.children[0] as HTMLDivElement).innerText
            sendMsg({
              type: 'captain',
              userName: name
            })
          }
          if (node.firstChild instanceof HTMLDivElement && node.firstChild.innerText === '超能用户' || node.children.length === 1 && node.children[0] instanceof HTMLDivElement && node.children[0].innerText === '可以点击他人的滚动弹幕进行@啦～') {
            continue
          }
          if (node.children.length !== 2) {
            const arr = Array.from(node.children) as (HTMLDivElement | HTMLSpanElement)[]
            const fansMedal = arr.find(node => /gift-fans-medal/.test(node.className))
            const actionIndex = arr.findIndex(node => /action/.test(node.className))
            const action = arr[actionIndex]
            const username = arr.find(node => /nickname/.test(node.className))!
            if (arr.find(node => node.innerText === '爆出')) {
              const count = arr.find(node => /gift-num/.test(node.className))!
              if (!count.innerText || arr.find(node => /count/.test(node.className))!.innerText !== '') {
                fault([node.innerHTML, -3])
                continue
              }
              const box = arr[actionIndex + 1].innerText
              const gift = arr[actionIndex + 3].innerText
              const data: GiftBox = {
                type: 'giftBox',
                boxName: box,
                giftName: gift,
                giftCount: +/\d+/.exec(count.innerText)!,
                userName: username.innerText
              }
              sendMsg(data)
              continue
            }
            const giftName = arr.find(node => /gift-name/.test(node.className) && node.innerText !== 'TA冠名的礼物') as HTMLSpanElement
            const fans = fansMedal?.innerText?.split('\n') ?? []
            const medalName = fans[0]
            const fansLevel = +fans[1]
            const gift = giftName.innerText
            const user = username.innerText
            const c = arr.find(node => /(gift-count|gift-num)/.test(node.className) && node.innerText.length > 1)
            if (c) {
              
              const data: ComboGifts = {
                type: 'giftCombo',
                userName: user,
                giftName: gift,
                count: +/\d+/.exec(c.innerText)!,
              }
              if (fansMedal) {
                data.fansMedal = {
                  name: medalName,
                  level: fansLevel
                }
              }
              sendMsg(data)
              continue
            }
            // const count = arr.find(node => /gift-count/.test(node.className))!
            const totalCount = arr.find(node => /gift-total-count/.test(node.className))!

            if (!giftName || !username || !action || !(action instanceof HTMLElement) || !/投喂/.test(action.innerText)
              || !totalCount
              // || (!count && !totalCount)
            ) {
              fault([node.innerHTML, -2]);
              continue
            }
            const Count = +(/\d+/.exec(totalCount.innerText) ?? 1)
            const data: ComboGifts = {
              type: 'giftCombo',
              userName: user,
              giftName: gift,
              totalCount: Count
            }
            if (fansMedal) {
              data.fansMedal = {
                name: medalName,
                level: fansLevel
              }
            }
            sendMsg(data)
            continue
          }
          const userNode = node.children[0]
          const dataNode = node.children[1]
          if (!(userNode instanceof HTMLElement) || !(dataNode instanceof HTMLElement)) {
            fault([node.innerHTML, 3])
            continue
          }
          const texts = userNode.innerText.split('\n')
          const danmu: Danmu = { type: 'danmu', username: texts[texts.length - 1].slice(0, -2), message: [] }
          if (texts.length === 3) {
            danmu.fansMedal = { level: +texts[1], name: texts[0] }
          }
          switch (dataNode.firstChild?.nodeType) {
            case Node.TEXT_NODE:
              danmu.message = parseContent(dataNode, 4)
              break
            case Node.ELEMENT_NODE:
              const child = dataNode.firstChild as HTMLImageElement
              if (child.tagName.toLowerCase() === 'img') {
                danmu.message.push({ type: 'img', url: child.src, name: child.alt })
              } else {
                danmu.message = parseContent(dataNode, 5)
              }
              break
            default:
              fault([node.innerHTML, 4])
          }
          sendMsg(danmu)
          continue
        }
      }
    }
  }
  const danmuObserver = new MutationObserver(danmuCallback)
  danmuObserver.observe(danmu, config)
}