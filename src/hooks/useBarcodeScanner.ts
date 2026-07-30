import { useEffect, useRef, useState } from 'react'

export type BarcodeScannerOptions = {
  /** 是否启用全局监听。例如在编辑模式下可关闭。 */
  enabled?: boolean
  /** 扫描码最小长度，短于该长度视为误触。 */
  minLength?: number
  /** 相邻字符最大间隔(ms)。扫描枪输入极快，超过则判定为人工输入。 */
  interKeyMaxMs?: number
  /** 结束符按键，默认 Enter（多数扫描枪以回车结尾）。 */
  suffix?: string
  /** 扫描到完整条码后的回调。 */
  onScan: (code: string) => void
}

/**
 * 复刻老系统 HSTIP 的"扫描器输入"：老系统通过串口(COM)读取 + 条码枪组件(GtSca)
 * 将扫描到的 Item No. 直接写入选样单。Web 端无法直接读 COM 口，但绝大多数 USB
 * 条码枪本质是一个"极快打字+回车"的键盘楔子(keyboard wedge)，本 Hook 据此实现：
 *  - 仅当焦点不在输入框时启用心跳监听（避免与手动输入/扫码进输入框重复）；
 *  - 利用字符间隔极短（< interKeyMaxMs）区分扫描枪与人工打字；
 *  - 拦截扫描字符，防止其"漏"进页面，扫描结束(回车)触发 onScan；
 *  - 返回 scanning 状态，便于 UI 显示"扫描中…"。
 */
export function useBarcodeScanner({
  enabled = true,
  minLength = 4,
  interKeyMaxMs = 45,
  suffix = 'Enter',
  onScan,
}: BarcodeScannerOptions) {
  const [scanning, setScanning] = useState(false)
  const bufferRef = useRef('')
  const lastTimeRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    const isTextField = (el: EventTarget | null) => {
      const node = el as HTMLElement | null
      if (!node) return false
      const tag = node.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (node as HTMLElement).isContentEditable
      )
    }

    const reset = () => {
      bufferRef.current = ''
      lastTimeRef.current = 0
      setScanning(false)
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const handler = (e: KeyboardEvent) => {
      // 焦点在输入框时，交给输入框自身处理（含"扫码进 Item No. 框"场景），避免重复触发。
      if (isTextField(e.target)) return

      if (e.key === suffix) {
        const code = bufferRef.current.trim()
        bufferRef.current = ''
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = null
        setScanning(false)
        if (code.length >= minLength) {
          e.preventDefault()
          onScanRef.current(code)
        }
        return
      }

      if (e.key.length === 1) {
        const now = performance.now()
        const dt = now - lastTimeRef.current
        const isScannerBurst = bufferRef.current === '' || dt <= interKeyMaxMs
        if (isScannerBurst) {
          e.preventDefault() // 阻止扫描字符污染页面
          bufferRef.current += e.key
          lastTimeRef.current = now
          setScanning(true)
          if (timerRef.current) window.clearTimeout(timerRef.current)
          timerRef.current = window.setTimeout(reset, 600)
        } else {
          // 间隔过大：视为人工按键或误触，重置缓冲
          bufferRef.current = e.key
          lastTimeRef.current = now
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [enabled, minLength, interKeyMaxMs, suffix])

  return { scanning }
}
