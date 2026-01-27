import { useState, useEffect, useRef, useCallback } from 'react'

export const useSensorData = (selectedRange) => {
  const [temperature, setTemperature] = useState(null)
  const [temperatureHistory, setTemperatureHistory] = useState({ timestamps: [], values: [] })
  const [vibrationHistory, setVibrationHistory] = useState({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
  const [dataZoomRange, setDataZoomRange] = useState({ start: 80, end: 100 })
  const [ipInfo, setIpInfo] = useState({ currentIp: '--', iolinkIp: '--' })
  const [networkStatus, setNetworkStatus] = useState({
    mqtt: { connected: false, latency: null },
    influxdb: { connected: false, latency: null }
  })
  
  const eventSourceRef = useRef(null)
  const abortControllerRef = useRef(null)
  const selectedRangeRef = useRef(selectedRange)
  const vibrationTemperatureRef = useRef(null)
  const isFetchingRef = useRef(false)  // 요청 진행 중 플래그

  // InfluxDB에서 온도 히스토리 데이터 가져오기
  const fetchTemperatureHistory = useCallback(async (range) => {
    const targetRange = range || selectedRangeRef.current
    
    // 이미 요청이 진행 중이면 스킵 (중복 요청 방지)
    if (isFetchingRef.current) {
      return
    }
    
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      // abort 후 약간의 지연 (취소된 요청이 완전히 정리될 시간)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    isFetchingRef.current = true
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const requestRange = targetRange
    
    try {
      const response = await fetch(`/api/influxdb/temperature?range=${requestRange}`, {
        signal: abortController.signal
      })
      
      if (response.ok) {
        const data = await response.json()
        const currentRange = selectedRangeRef.current
        const isAborted = abortController.signal.aborted
        
        if (requestRange === currentRange && !isAborted) {
          if (data.timestamps && data.timestamps.length > 0) {
            if (selectedRangeRef.current === requestRange) {
              setTemperatureHistory({
                timestamps: data.timestamps || [],
                values: data.values || []
              })
            }
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('온도 히스토리 데이터 가져오기 실패:', error)
      }
    } finally {
      // 요청 완료 후 플래그 해제
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
      isFetchingRef.current = false
    }
  }, [])

  // selectedRange가 변경되면 해당 범위의 데이터 로드
  useEffect(() => {
    selectedRangeRef.current = selectedRange
    
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    isFetchingRef.current = false
    
    setTemperatureHistory({ timestamps: [], values: [] })
    setDataZoomRange({ start: 0, end: 100 })
    
    // 약간의 지연 후 새 요청 시작 (취소된 요청이 정리될 시간 확보)
    const timeoutId = setTimeout(() => {
      fetchTemperatureHistory(selectedRangeRef.current)
    }, 100)
    
    const interval = setInterval(() => {
      fetchTemperatureHistory(selectedRangeRef.current)
    }, 5000)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(interval)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      isFetchingRef.current = false
    }
  }, [selectedRange, fetchTemperatureHistory])

  // 진동센서 히스토리 데이터 가져오기
  const fetchVibrationHistory = useCallback(async (range) => {
    const targetRange = range || selectedRangeRef.current
    
    try {
      const response = await fetch(`/api/influxdb/vibration?range=${targetRange}`)
      if (response.ok) {
        const data = await response.json()
        if (data.timestamps && data.timestamps.length > 0) {
          setVibrationHistory({
            timestamps: data.timestamps || [],
            v_rms: data.v_rms || [],
            a_peak: data.a_peak || [],
            a_rms: data.a_rms || [],
            crest: data.crest || [],
            temperature: data.temperature || []
          })
        } else {
          setVibrationHistory({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
        }
      }
    } catch (error) {
      console.error('진동센서 히스토리 데이터 가져오기 실패:', error)
    }
  }, [])

  // selectedRange가 변경되면 진동센서 데이터도 로드
  useEffect(() => {
    setVibrationHistory({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
    fetchVibrationHistory(selectedRangeRef.current)
    
    const interval = setInterval(() => {
      fetchVibrationHistory(selectedRangeRef.current)
    }, 5000)
    
    return () => clearInterval(interval)
  }, [selectedRange, fetchVibrationHistory])

  // IP 정보 가져오기
  useEffect(() => {
    const fetchIpInfo = async () => {
      try {
        const response = await fetch('/api/system/ip')
        if (response.ok) {
          const data = await response.json()
          setIpInfo({
            currentIp: data.current_ip || '--',
            iolinkIp: data.iolink_ip || '--'
          })
        }
      } catch (error) {
        console.error('IP 정보 가져오기 실패:', error)
      }
    }
    
    fetchIpInfo()
    const interval = setInterval(fetchIpInfo, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // 네트워크 연결 상태 확인 (MQTT, InfluxDB)
  useEffect(() => {
    const fetchNetworkStatus = async () => {
      try {
        const response = await fetch('/api/network/status')
        if (response.ok) {
          const data = await response.json()
          setNetworkStatus(data)
        }
      } catch (error) {
        console.error('네트워크 상태 확인 실패:', error)
        setNetworkStatus({
          mqtt: { connected: false, latency: null },
          influxdb: { connected: false, latency: null }
        })
      }
    }
    
    fetchNetworkStatus()
    const interval = setInterval(fetchNetworkStatus, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Server-Sent Events를 통해 백엔드에서 MQTT 데이터 수신
  useEffect(() => {
    const eventSource = new EventSource('/api/mqtt/temperature')
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.heartbeat) {
          return
        }
        
        if (data.temperature !== undefined) {
          setTemperature(data.temperature)
          fetchTemperatureHistory(selectedRangeRef.current)
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error)
      }
    }
    
    eventSource.onerror = (error) => {
      console.error('SSE Error:', error)
    }
    
    eventSourceRef.current = eventSource

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [fetchTemperatureHistory])

  return {
    temperature,
    temperatureHistory,
    vibrationHistory,
    dataZoomRange,
    setDataZoomRange,
    ipInfo,
    networkStatus,
    vibrationTemperatureRef,
    fetchTemperatureHistory
  }
}
