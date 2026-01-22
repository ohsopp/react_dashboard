import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Sortable from 'sortablejs'
import './App.css'
import { Panel, TopBar, DataRangeSelector, EditModal } from './components'
import Chart from './components/dashboard/Chart/Chart'
import SensorInfo from './components/dashboard/SensorInfo/SensorInfo'

// 일반 패널 그래프 grid 설정 (유지보수 편의를 위해 상수로 분리)
const DEFAULT_PANEL_GRID = {
  left: '25px',
  right: '25px',
  bottom: '10px',
  top: '10%'
}

function App() {
  const [selectedRange, setSelectedRange] = useState('1h')
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
  const abortControllerRef = useRef(null) // AbortController 추적
  const selectedRangeRef = useRef(selectedRange) // 최신 selectedRange 추적
  const vibrationTemperatureRef = useRef(null) // 진동센서 온도값 유지 (깜빡임 방지)
  
  const getSubtitle = () => {
    const rangeMap = {
      '1h': 'Last 1 hour',
      '6h': 'Last 6 hours',
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days'
    }
    return rangeMap[selectedRange] || 'Last 1 hour'
  }

  const panelConfigs = useMemo(() => {
    // Chart 데이터 포맷 변환
    const chartData = {
      labels: temperatureHistory.timestamps.map(ts => {
        const date = new Date(ts)
        // 선택된 범위에 따라 날짜 포맷 조정
        if (selectedRange === '7d') {
          return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + 
                 date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        } else {
          return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        }
      }),
      timestamps: temperatureHistory.timestamps, // 원본 타임스탬프 유지
      datasets: [{
        label: 'Temperature',
        data: temperatureHistory.values.map(val => val !== null && val !== undefined ? val : null),
        borderColor: '#58a6ff',
        backgroundColor: 'rgba(88, 166, 255, 0.1)'
      }]
    }

    return [
      { 
        id: 'panel1', 
        title: 'Temperature History', 
        content: temperatureHistory.timestamps.length > 0 ? (
          <Chart 
            key={`chart-${selectedRange}`}
            type="line" 
            data={chartData}
            dataZoomStart={dataZoomRange.start}
            dataZoomEnd={dataZoomRange.end}
            timeRange={selectedRange}
            onDataZoomChange={(start, end) => setDataZoomRange({ start, end })}
            options={{
              animation: false,
              sampling: 'lttb',
              grid: DEFAULT_PANEL_GRID
            }}
          />
        ) : (
          <div className="chart-placeholder">
            데이터를 불러오는 중...
          </div>
        )
      },
      { 
        id: 'panel2', 
        title: 'Customized Pie', 
        content: (
          <Chart 
            type="pie" 
            data={{
              series: {
                name: 'Access From',
                data: [
                  { value: 335, name: 'Direct' },
                  { value: 310, name: 'Email' },
                  { value: 274, name: 'Union Ads' },
                  { value: 235, name: 'Video Ads' },
                  { value: 400, name: 'Search Engine' }
                ]
              }
            }}
            options={{
              backgroundColor: '#0d1117'
            }}
          />
        )
      },
      { 
        id: 'panel5', 
        title: 'Bar Animation', 
        content: (
          <Chart 
            type="bar" 
            options={{}}
          />
        )
      },
      {
        id: 'panel6',
        title: 'Temperature (AQI Style)',
        content: temperatureHistory.timestamps.length > 0 ? (
          <Chart
            type="aqi"
            data={{
              title: 'Temperature',
              name: 'Temperature',
              labels: temperatureHistory.timestamps.map(ts => {
                const date = new Date(ts)
                if (selectedRange === '7d') {
                  return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + 
                         date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                } else {
                  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                }
              }),
              timestamps: temperatureHistory.timestamps,
              values: temperatureHistory.values.map(val => val !== null && val !== undefined ? val : null)
            }}
            timeRange={selectedRange}
            options={{
              animation: false,
              sampling: 'lttb',
              grid: DEFAULT_PANEL_GRID

            }}
          />
        ) : (
          <div className="chart-placeholder">
            데이터를 불러오는 중...
          </div>
        )
      },
      {
        id: 'panel7',
        title: 'Vibration Sensor',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
            {vibrationHistory.timestamps.length > 0 ? (
              <Chart
                key={`vibration-chart-${selectedRange}`}
                type="line"
                data={{
                  labels: vibrationHistory.timestamps.map(ts => {
                    const date = new Date(ts)
                    if (selectedRange === '7d') {
                      return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + 
                             date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                    } else {
                      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                    }
                  }),
                  timestamps: vibrationHistory.timestamps,
                  datasets: [
                    {
                      label: 'v-RMS (mm/s)',
                      data: (vibrationHistory.v_rms || []).map(val => val !== null && val !== undefined ? val : null)
                    },
                    {
                      label: 'a-Peak (m/s²)',
                      data: (vibrationHistory.a_peak || []).map(val => val !== null && val !== undefined ? val : null)
                    },
                    {
                      label: 'a-RMS (m/s²)',
                      data: (vibrationHistory.a_rms || []).map(val => val !== null && val !== undefined ? val : null)
                    },
                    {
                      label: 'Crest',
                      data: (vibrationHistory.crest || []).map(val => val !== null && val !== undefined ? val : null)
                    }
                  ]
                }}
                timeRange={selectedRange}
                options={{
                  animation: false,
                  sampling: 'lttb',
                  dataZoom: [], // 진동센서 그래프는 줌 기능 비활성화
                  grid: DEFAULT_PANEL_GRID
                }}
              />
            ) : (
              <div className="chart-placeholder">
                데이터를 불러오는 중...
              </div>
            )}
          </div>
        )
      },
      {
        id: 'panel8',
        title: 'Sensor Information',
        content: <SensorInfo ports={["1", "2"]} showMasterInfo={true} />
      }
      ]
    }, [temperature, temperatureHistory, vibrationHistory, selectedRange, dataZoomRange])

  // 통계 패널 설정 (별도 관리)
  const statPanelConfigs = useMemo(() => {
    // 온도 평균 계산
    let avgTemperature = '--'
    if (temperatureHistory.values && temperatureHistory.values.length > 0) {
      const validValues = temperatureHistory.values.filter(v => v !== null && v !== undefined && !isNaN(v))
      if (validValues.length > 0) {
        const sum = validValues.reduce((acc, val) => acc + val, 0)
        avgTemperature = (sum / validValues.length).toFixed(1) + '°C'
      }
    }
    
    // 진동센서 평균 계산 (Crest 사용)
    let avgVibration = '--'
    if (vibrationHistory.crest && vibrationHistory.crest.length > 0) {
      const validValues = vibrationHistory.crest.filter(v => v !== null && v !== undefined && !isNaN(v))
      if (validValues.length > 0) {
        const sum = validValues.reduce((acc, val) => acc + val, 0)
        avgVibration = (sum / validValues.length).toFixed(2)
      }
    }
    
    // 실시간 온도값
    const currentTemperature = temperature !== null && temperature !== undefined && !isNaN(temperature) 
      ? `${temperature.toFixed(1)}°C` 
      : '--'
    
    // 실시간 진동값 (Crest, 최신값)
    let currentVibration = '--'
    if (vibrationHistory.crest && vibrationHistory.crest.length > 0) {
      const latestValues = vibrationHistory.crest.slice(-1) // 최신값
      const latestValue = latestValues[0]
      if (latestValue !== null && latestValue !== undefined && !isNaN(latestValue)) {
        currentVibration = latestValue.toFixed(2)
      }
    }
    
    return [
      { id: 'stat-panel6', title: 'Temperature Average', content: (
        <div className="stat-panel stat-panel-with-chart">
          <div className="stat-panel-chart-bg">
            {temperatureHistory.values && temperatureHistory.values.length > 0 ? (
              <Chart
                type="mini"
                data={{
                  values: temperatureHistory.values,
                  timestamps: temperatureHistory.timestamps
                }}
                options={{}}
              />
            ) : null}
          </div>
          <div className="stat-panel-content">
            <div className="stat-value">{avgTemperature}</div>
          </div>
        </div>
      ) },
      { id: 'stat-panel7', title: 'Vibration Average', content: (
        <div className="stat-panel stat-panel-with-chart">
          <div className="stat-panel-chart-bg">
            {vibrationHistory.v_rms && vibrationHistory.v_rms.length > 0 && (
              vibrationHistory.v_rms.some(v => v !== null && v !== undefined && !isNaN(v)) ||
              vibrationHistory.a_peak?.some(v => v !== null && v !== undefined && !isNaN(v)) ||
              vibrationHistory.a_rms?.some(v => v !== null && v !== undefined && !isNaN(v)) ||
              vibrationHistory.crest?.some(v => v !== null && v !== undefined && !isNaN(v))
            ) ? (
              <Chart
                type="mini"
                data={{
                  datasets: [
                    {
                      label: 'v-RMS',
                      data: (vibrationHistory.v_rms || []).map(val => val !== null && val !== undefined && !isNaN(val) ? val : null)
                    },
                    {
                      label: 'a-Peak',
                      data: (vibrationHistory.a_peak || []).map(val => val !== null && val !== undefined && !isNaN(val) ? val : null)
                    },
                    {
                      label: 'a-RMS',
                      data: (vibrationHistory.a_rms || []).map(val => val !== null && val !== undefined && !isNaN(val) ? val : null)
                    },
                    {
                      label: 'Crest',
                      data: (vibrationHistory.crest || []).map(val => val !== null && val !== undefined && !isNaN(val) ? val : null)
                    }
                  ],
                  timestamps: vibrationHistory.timestamps
                }}
                options={{
                  yAxis: {
                    min: undefined,
                    max: undefined,
                    splitLine: {
                      show: false
                    },
                    axisLabel: {
                      show: false
                    }
                  }
                }}
              />
            ) : null}
          </div>
          <div className="stat-panel-content">
            <div className="stat-value">{avgVibration}</div>
          </div>
        </div>
      ) },
      { id: 'stat-panel8', title: 'Real-time Values', content: <div className="stat-panel ip-panel"><div className="ip-row"><span className="ip-label">Temperature</span><span className="ip-address">{currentTemperature}</span></div><div className="ip-row"><span className="ip-label">Vibration (Crest)</span><span className="ip-address">{currentVibration}</span></div></div> },
      { id: 'stat-panel9', title: 'Network Status', content: <div className="stat-panel ip-panel"><div className="ip-row"><span className="ip-label">MQTT</span><div className="status-row"><span className={`status-indicator ${networkStatus.mqtt.connected ? 'connected' : 'disconnected'}`}></span><span className="ip-address">{networkStatus.mqtt.connected ? (networkStatus.mqtt.latency !== null ? `${networkStatus.mqtt.latency}ms` : '--') : 'Disconnected'}</span></div></div><div className="ip-row"><span className="ip-label">InfluxDB</span><div className="status-row"><span className={`status-indicator ${networkStatus.influxdb.connected ? 'connected' : 'disconnected'}`}></span><span className="ip-address">{networkStatus.influxdb.connected ? (networkStatus.influxdb.latency !== null ? `${networkStatus.influxdb.latency}ms` : '--') : 'Disconnected'}</span></div></div></div> }
    ]
  }, [temperature, temperatureHistory, vibrationHistory, ipInfo, networkStatus])

  // 기본 레이아웃: panel1, panel6, panel7 (3등분), panel2, panel5 (2등분), panel8 (전체)
  const DEFAULT_PANEL_SIZES = {
    panel1: 4,  // 3등분 (12/3 = 4)
    panel2: 6,  // 2등분 (12/2 = 6)
    panel5: 6,  // 2등분 (12/2 = 6)
    panel6: 4,  // 3등분 (12/3 = 4)
    panel7: 4,  // 3등분 (12/3 = 4)
    panel8: 6  // 절반 (12/2 = 6)
  }
  
  const [panelSizes, setPanelSizes] = useState(() => {
    // localStorage에서 저장된 레이아웃 불러오기
    try {
      const saved = localStorage.getItem('dashboard-layout')
      if (saved) {
        const layout = JSON.parse(saved)
        if (layout.panels) {
          const sizes = {}
          Object.keys(layout.panels).forEach(panelId => {
            sizes[panelId] = layout.panels[panelId].width
          })
          // 기본값과 병합 (없는 패널은 기본값 사용)
          return { ...DEFAULT_PANEL_SIZES, ...sizes }
        }
      }
    } catch (e) {
      console.error('레이아웃 로드 실패:', e)
    }
    return DEFAULT_PANEL_SIZES
  })
  
  // 통계 패널 전용 사이즈/순서/숨김 관리 (4개를 한 줄에 배치: 12/4 = 3)
  const [statPanelSizes, setStatPanelSizes] = useState({
    'stat-panel6': 3,  // 1/4
    'stat-panel7': 3,  // 1/4
    'stat-panel8': 3,  // 1/4
    'stat-panel9': 3   // 1/4
  })
  
  const [isDragging, setIsDragging] = useState(false)
  const [isStatDragging, setIsStatDragging] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const sortableInstance = useRef(null)
  const statSortableInstance = useRef(null)
  const containerRef = useRef(null)
  const statContainerRef = useRef(null)
  
  // 기본 패널 순서: panel1 (Temperature History), panel6 (AQI), panel7 (Vibration), panel2 (Pie), panel5 (Bar), panel8 (Sensor Info)
  // panelConfigs 배열: [panel1(0), panel2(1), panel5(2), panel6(3), panel7(4), panel8(5)]
  const DEFAULT_PANEL_ORDER = [0, 3, 4, 1, 2, 5] // panel1=0, panel6=3, panel7=4, panel2=1, panel5=2, panel8=5
  
  const [panelOrder, setPanelOrder] = useState(() => {
    // localStorage에서 저장된 순서 불러오기
    try {
      const saved = localStorage.getItem('dashboard-layout')
      if (saved) {
        const layout = JSON.parse(saved)
        if (layout.order && layout.order['dashboard-container']) {
          // 저장된 패널 ID를 인덱스로 변환
          const savedOrder = layout.order['dashboard-container']
          const orderMap = {
            'panel1': 0,
            'panel2': 1,
            'panel5': 2,
            'panel6': 3,
            'panel7': 4,
            'panel8': 5
          }
          const convertedOrder = savedOrder
            .map(id => orderMap[id])
            .filter(index => index !== undefined)
          
          // 기본 순서와 병합 (없는 패널은 기본 순서 사용)
          if (convertedOrder.length > 0) {
            const allPanels = [0, 1, 2, 3, 4, 5] // 모든 패널 인덱스
            const missing = allPanels.filter(idx => !convertedOrder.includes(idx))
            return [...convertedOrder, ...missing]
          }
        }
      }
    } catch (e) {
      console.error('패널 순서 로드 실패:', e)
    }
    return DEFAULT_PANEL_ORDER
  })
  
  const [statPanelOrder, setStatPanelOrder] = useState(() => {
    return [0, 1, 2, 3]
  })
  
  const panelOrderRef = useRef([0, 3, 4, 1, 2, 5]) // 기본 순서: panel1, panel6, panel7, panel2, panel5, panel8
  const statPanelOrderRef = useRef([0, 1, 2, 3])
  const panelSizesRef = useRef({
    panel1: 4,
    panel2: 6,
    panel5: 6,
    panel6: 4,
    panel7: 4,
    panel8: 12
  })
  const statPanelSizesRef = useRef({
    'stat-panel6': 3,
    'stat-panel7': 3,
    'stat-panel8': 3,
    'stat-panel9': 3
  })
  
  // panelOrder가 변경될 때 panelOrderRef 업데이트
  useEffect(() => {
    panelOrderRef.current = panelOrder
  }, [panelOrder])
  
  // panelSizes가 변경될 때 panelSizesRef 업데이트
  useEffect(() => {
    panelSizesRef.current = panelSizes
  }, [panelSizes])
  
  // selectedRange가 변경될 때마다 ref 업데이트
  useEffect(() => {
    selectedRangeRef.current = selectedRange
  }, [selectedRange])
  
  // InfluxDB에서 온도 히스토리 데이터 가져오기
  const fetchTemperatureHistory = useCallback(async (range) => {
    // range가 없으면 최신 selectedRange 사용 (ref를 통해)
    const targetRange = range || selectedRangeRef.current
    
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // 새로운 AbortController 생성
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    // 요청 시점의 selectedRange 저장 (응답 처리 시 비교용)
    const requestRange = targetRange
    
    try {
      const response = await fetch(`/api/influxdb/temperature?range=${requestRange}`, {
        signal: abortController.signal
      })
      
      if (response.ok) {
        const data = await response.json()
        // 요청 시점의 range와 현재 selectedRange가 일치하고 요청이 취소되지 않은 경우에만 데이터 설정
        // ref를 통해 최신 selectedRange 확인 (클로저 문제 해결)
        const currentRange = selectedRangeRef.current
        const isAborted = abortController.signal.aborted
        
        if (requestRange === currentRange && !isAborted) {
          // 데이터가 있을 때만 업데이트
          if (data.timestamps && data.timestamps.length > 0) {
            // 한 번 더 최신 range 확인 (이중 체크로 비동기 응답 순서 문제 해결)
            if (selectedRangeRef.current === requestRange) {
              setTemperatureHistory({
                timestamps: data.timestamps || [],
                values: data.values || []
              })
              console.log(`✅ 데이터 업데이트: ${requestRange} 범위, ${data.timestamps.length}개 데이터 포인트`)
            } else {
              console.log(`⚠️ 응답 무시: 최종 확인 시 범위 불일치 (요청: ${requestRange}, 현재: ${selectedRangeRef.current})`)
            }
          } else {
            console.log(`⚠️ 응답 무시: 데이터가 없음 (${requestRange} 범위)`)
          }
        } else {
          console.log(`⚠️ 응답 무시: 요청 범위(${requestRange})와 현재 범위(${currentRange}) 불일치 또는 취소됨`)
        }
      }
    } catch (error) {
      // AbortError는 정상적인 취소이므로 무시
      if (error.name !== 'AbortError') {
        console.error('온도 히스토리 데이터 가져오기 실패:', error)
      }
    }
  }, []) // 의존성 배열을 비워서 함수가 재생성되지 않도록 함 (클로저 문제 해결)

  // selectedRange가 변경되면 해당 범위의 데이터 로드
  useEffect(() => {
    // ref 업데이트 (최신 selectedRange 추적)
    selectedRangeRef.current = selectedRange
    
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // 이전 데이터 완전히 초기화 (다른 범위 그래프가 보이지 않도록)
    setTemperatureHistory({ timestamps: [], values: [] })
    
    // dataZoom 초기화
    setDataZoomRange({ start: 0, end: 100 })
    
    // 현재 selectedRange로 데이터 로드 (ref를 통해 최신 값 사용)
    fetchTemperatureHistory(selectedRangeRef.current)
    
    // 5초마다 데이터 업데이트 (실시간)
    // interval 내부에서 ref를 통해 최신 selectedRange 사용 (클로저 문제 해결)
    const interval = setInterval(() => {
      // ref를 통해 최신 selectedRange 사용 (항상 최신 값 참조)
      fetchTemperatureHistory(selectedRangeRef.current)
    }, 5000)

    return () => {
      clearInterval(interval)
      // cleanup 시 진행 중인 요청 취소
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [selectedRange]) // fetchTemperatureHistory는 ref를 사용하므로 의존성에서 제거 (클로저 문제 해결)

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
          // 데이터가 없으면 빈 배열로 초기화
          setVibrationHistory({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
        }
      }
    } catch (error) {
      console.error('진동센서 히스토리 데이터 가져오기 실패:', error)
    }
  }, [])

  // selectedRange가 변경되면 진동센서 데이터도 로드
  useEffect(() => {
    // 이전 데이터 완전히 초기화
    setVibrationHistory({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
    
    // 현재 selectedRange로 데이터 로드
    fetchVibrationHistory(selectedRangeRef.current)
    
    // 5초마다 데이터 업데이트 (실시간)
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
    // 30초마다 IP 정보 업데이트
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
    // 5초마다 네트워크 상태 업데이트
    const interval = setInterval(fetchNetworkStatus, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Server-Sent Events를 통해 백엔드에서 MQTT 데이터 수신
  useEffect(() => {
    console.log('🔄 SSE 연결 시도: /api/mqtt/temperature')
    
    const eventSource = new EventSource('/api/mqtt/temperature')
    
    eventSource.onopen = () => {
      console.log('✅ SSE Connection opened')
    }
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // 하트비트는 무시
        if (data.heartbeat) {
          return
        }
        
        if (data.temperature !== undefined) {
          console.log('📨 Temperature received:', data.temperature)
          setTemperature(data.temperature)
          // 새로운 온도가 들어오면 최신 selectedRange로 히스토리 업데이트 (ref 사용)
          fetchTemperatureHistory(selectedRangeRef.current)
        }
      } catch (error) {
        console.error('❌ Error parsing SSE message:', error)
      }
    }
    
    eventSource.onerror = (error) => {
      console.error('❌ SSE Error:', error)
      console.log('💡 백엔드 서버가 실행 중인지 확인하세요 (포트 5005)')
    }
    
    eventSourceRef.current = eventSource

    return () => {
      if (eventSourceRef.current) {
        console.log('🧹 Closing SSE connection')
        eventSourceRef.current.close()
      }
    }
  }, [])
  
  const [hiddenPanels, setHiddenPanels] = useState(() => {
    // localStorage에서 숨겨진 패널 로드
    try {
      const saved = localStorage.getItem('hidden-panels')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('숨겨진 패널 로드 실패:', e)
    }
    return []
  })
  
  const [hiddenStatPanels, setHiddenStatPanels] = useState(() => {
    // localStorage에서 숨겨진 통계 패널 로드
    try {
      const saved = localStorage.getItem('hidden-stat-panels')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('숨겨진 통계 패널 로드 실패:', e)
    }
    return []
  })

  // ref 업데이트
  useEffect(() => {
    panelOrderRef.current = panelOrder
  }, [panelOrder])

  useEffect(() => {
    panelSizesRef.current = panelSizes
  }, [panelSizes])
  
  useEffect(() => {
    statPanelOrderRef.current = statPanelOrder
  }, [statPanelOrder])
  
  useEffect(() => {
    statPanelSizesRef.current = statPanelSizes
  }, [statPanelSizes])
  
  // statPanelConfigs의 길이가 변경되면 statPanelOrderRef 업데이트
  const statPanelConfigsLength = statPanelConfigs.length
  useEffect(() => {
    const newOrder = statPanelConfigs.map((_, index) => index)
    if (statPanelOrder.length !== newOrder.length) {
      statPanelOrderRef.current = newOrder
      setStatPanelOrder(newOrder)
    } else {
      statPanelOrderRef.current = newOrder
    }
  }, [statPanelConfigsLength])

  const handleSizeChange = (panelId, newSize) => {
    setPanelSizes(prev => ({
      ...prev,
      [panelId]: newSize
    }))
    // 레이아웃 저장
    setTimeout(() => saveLayout(), 0)
  }
  
  const handleStatSizeChange = (panelId, newSize) => {
    setStatPanelSizes(prev => ({
      ...prev,
      [panelId]: newSize
    }))
    // 레이아웃 저장
    setTimeout(() => saveStatLayout(), 0)
  }

  // 그리드 레이아웃에서 각 패널이 속한 줄을 계산
  const calculateRowLayout = (order, sizes = null) => {
    const currentSizes = sizes || panelSizesRef.current
    const rows = []
    let currentRow = []
    let currentRowWidth = 0

    order.forEach((orderIndex) => {
      const config = panelConfigs[orderIndex]
      const panelSize = currentSizes[config.id]
      
      if (currentRowWidth + panelSize > 12) {
        rows.push([...currentRow])
        currentRow = [orderIndex]
        currentRowWidth = panelSize
      } else {
        currentRow.push(orderIndex)
        currentRowWidth += panelSize
      }
    })
    
    if (currentRow.length > 0) {
      rows.push(currentRow)
    }
    
    return rows
  }

  // 드롭 위치의 줄에서 빈 공간 계산
  const calculateEmptySpace = (order, dropIndex, sizes = null) => {
    const currentSizes = sizes || panelSizesRef.current
    const rows = calculateRowLayout(order, currentSizes)
    let currentIndex = 0
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowStartIndex = currentIndex
      const rowEndIndex = currentIndex + row.length - 1
      
      if (dropIndex >= rowStartIndex && dropIndex <= rowEndIndex) {
        let rowWidth = 0
        row.forEach(orderIndex => {
          const config = panelConfigs[orderIndex]
          rowWidth += currentSizes[config.id]
        })
        return 12 - rowWidth
      }
      
      currentIndex += row.length
    }
    
    return 12 // 완전히 빈 줄
  }

  // 패널 순서 업데이트
  const updatePanelOrder = () => {
    if (!containerRef.current) return
    
    const panels = Array.from(containerRef.current.querySelectorAll('.panel:not(.hidden)'))
    const newOrder = panels.map(panel => {
      const panelId = panel.getAttribute('data-panel-id')
      const index = panelConfigs.findIndex(config => config.id === panelId)
      return index !== -1 ? index : null
    }).filter(index => index !== null)
    
    setPanelOrder(newOrder)
  }

  // 패널 숨기기
  const handleHidePanel = (panelId) => {
    setHiddenPanels(prev => {
      // 이미 숨겨진 패널이면 추가하지 않음
      if (prev.includes(panelId)) {
        return prev
      }
      const newHidden = [...prev, panelId]
      // localStorage에 저장
      try {
        localStorage.setItem('hidden-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 패널 저장 실패:', e)
      }
      return newHidden
    })
  }
  
  // 통계 패널 숨기기
  const handleHideStatPanel = (panelId) => {
    setHiddenStatPanels(prev => {
      if (prev.includes(panelId)) {
        return prev
      }
      const newHidden = [...prev, panelId]
      try {
        localStorage.setItem('hidden-stat-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 통계 패널 저장 실패:', e)
      }
      return newHidden
    })
  }

  // 패널 다시 표시하기 (편집 버튼에서 사용)
  const handleShowPanel = (panelId) => {
    setHiddenPanels(prev => {
      const newHidden = prev.filter(id => id !== panelId)
      // localStorage에 저장
      try {
        localStorage.setItem('hidden-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 패널 저장 실패:', e)
      }
      return newHidden
    })
  }
  
  // 통계 패널 다시 표시하기
  const handleShowStatPanel = (panelId) => {
    setHiddenStatPanels(prev => {
      const newHidden = prev.filter(id => id !== panelId)
      try {
        localStorage.setItem('hidden-stat-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 통계 패널 저장 실패:', e)
      }
      return newHidden
    })
  }

  // 숨겨진 패널 목록 가져오기 (편집 버튼에서 사용)
  const getHiddenPanels = () => {
    return hiddenPanels
  }

  // 레이아웃 저장 (localStorage)
  const saveLayout = () => {
    try {
      const layout = {
        panels: {},
        order: {}
      }
      
      // 각 패널의 너비 저장 (최신 값 참조)
      const currentSizes = panelSizesRef.current
      Object.keys(currentSizes).forEach(panelId => {
        layout.panels[panelId] = {
          width: currentSizes[panelId]
        }
      })
      
      // 패널 순서 저장
      if (containerRef.current) {
        const panels = Array.from(containerRef.current.querySelectorAll('.panel:not(.hidden)'))
        layout.order['dashboard-container'] = panels.map(panel => 
          panel.getAttribute('data-panel-id')
        ).filter(id => id)
      }
      
      localStorage.setItem('dashboard-layout', JSON.stringify(layout))
    } catch (e) {
      console.error('레이아웃 저장 실패:', e)
    }
  }
  
  // 통계 패널 레이아웃 저장
  const saveStatLayout = () => {
    try {
      const layout = {
        panels: {},
        order: {}
      }
      
      const currentSizes = statPanelSizesRef.current
      Object.keys(currentSizes).forEach(panelId => {
        layout.panels[panelId] = {
          width: currentSizes[panelId]
        }
      })
      
      if (statContainerRef.current) {
        const panels = Array.from(statContainerRef.current.querySelectorAll('.panel:not(.hidden)'))
        layout.order['stats-container'] = panels.map(panel => 
          panel.getAttribute('data-panel-id')
        ).filter(id => id)
      }
      
      localStorage.setItem('stat-dashboard-layout', JSON.stringify(layout))
    } catch (e) {
      console.error('통계 패널 레이아웃 저장 실패:', e)
    }
  }

  // SortableJS 초기화
  useEffect(() => {
    const initSortable = () => {
      if (!containerRef.current) return

      // 기존 인스턴스 제거
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
        sortableInstance.current = null
      }

      // SortableJS 인스턴스 생성
      try {
        sortableInstance.current = new Sortable(containerRef.current, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          filter: '.panel-resize-handle, button, .panel-modal-close',
          preventOnFilter: false,
          disabled: isModalOpen, // 모달이 열려있으면 드래그 비활성화
          
          onStart: (evt) => {
            // 모달이 열려있으면 드래그 방지
            if (isModalOpen || document.querySelector('.panel-modal-overlay')) {
              evt.cancel()
              return
            }
            setIsDragging(true)
            evt.item.classList.add('dragging', 'sortable-selected')
          },
          
          onEnd: (evt) => {
            const panel = evt.item
            panel.classList.remove('dragging', 'sortable-selected')
            
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex
            
            if (oldIndex === newIndex) {
              setIsDragging(false)
              return
            }

            // 최신 값 참조
            const currentOrder = panelOrderRef.current

            // 새 순서 생성 (위치만 변경, 너비는 변경하지 않음)
            const newOrder = [...currentOrder]
            const [draggedOrder] = newOrder.splice(oldIndex, 1)
            newOrder.splice(newIndex, 0, draggedOrder)

            // 패널 순서만 업데이트
            setPanelOrder(newOrder)
            
            // 패널 순서 업데이트
            setTimeout(() => {
              updatePanelOrder()
              saveLayout()
            }, 0)
            
            // 드래그 플래그 해제 (클릭 이벤트와 구분하기 위해 지연)
            setTimeout(() => {
              setIsDragging(false)
            }, 100)
          }
        })
      } catch (error) {
        console.error('SortableJS 초기화 실패:', error)
      }
    }

    // DOM이 렌더링될 때까지 대기
    const timer = setTimeout(initSortable, 0)

      return () => {
        clearTimeout(timer)
        if (sortableInstance.current) {
          sortableInstance.current.destroy()
          sortableInstance.current = null
        }
      }
    }, [isModalOpen]) // 모달 상태 변경 시 재초기화

  // 통계 패널용 SortableJS 초기화
  useEffect(() => {
    const initStatSortable = () => {
      if (!statContainerRef.current) return

      // 기존 인스턴스 제거
      if (statSortableInstance.current) {
        statSortableInstance.current.destroy()
        statSortableInstance.current = null
      }

      // SortableJS 인스턴스 생성
      try {
        statSortableInstance.current = new Sortable(statContainerRef.current, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          filter: '.panel-resize-handle, button, .panel-modal-close',
          preventOnFilter: false,
          disabled: isModalOpen,
          
          onStart: (evt) => {
            if (isModalOpen || document.querySelector('.panel-modal-overlay')) {
              evt.cancel()
              return
            }
            setIsStatDragging(true)
            evt.item.classList.add('dragging', 'sortable-selected')
          },
          
          onEnd: (evt) => {
            const panel = evt.item
            panel.classList.remove('dragging', 'sortable-selected')
            
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex
            
            if (oldIndex === newIndex) {
              setIsStatDragging(false)
              return
            }

            const currentOrder = statPanelOrderRef.current
            const newOrder = [...currentOrder]
            const [draggedOrder] = newOrder.splice(oldIndex, 1)
            newOrder.splice(newIndex, 0, draggedOrder)

            setStatPanelOrder(newOrder)
            
            setTimeout(() => {
              updateStatPanelOrder()
              saveStatLayout()
            }, 0)
            
            setTimeout(() => {
              setIsStatDragging(false)
            }, 100)
          }
        })
      } catch (error) {
        console.error('통계 패널 SortableJS 초기화 실패:', error)
      }
    }

    const timer = setTimeout(initStatSortable, 0)

    return () => {
      clearTimeout(timer)
      if (statSortableInstance.current) {
        statSortableInstance.current.destroy()
        statSortableInstance.current = null
      }
    }
  }, [isModalOpen])

  // 통계 패널 순서 업데이트
  const updateStatPanelOrder = () => {
    if (!statContainerRef.current) return
    
    const panels = Array.from(statContainerRef.current.querySelectorAll('.panel:not(.hidden)'))
    const newOrder = panels.map(panel => {
      const panelId = panel.getAttribute('data-panel-id')
      const index = statPanelConfigs.findIndex(config => config.id === panelId)
      return index !== -1 ? index : null
    }).filter(index => index !== null)
    
    setStatPanelOrder(newOrder)
  }

  const handleEdit = () => {
    setIsEditModalOpen(true)
  }

  return (
    <div className="App">
      <TopBar
        timeRange={selectedRange}
        onRefresh={() => fetchTemperatureHistory(selectedRange)}
        breadcrumbItems={['Home', 'Dashboards', 'Sensor Data']}
      />
      
      <DataRangeSelector
        selected={selectedRange}
        onSelect={setSelectedRange}
        onEdit={handleEdit}
      />
      
      {/* 통계 패널 그리드 (상단 작은 카드) */}
      <div 
        ref={statContainerRef}
        className="stats-container"
        id="stats-container"
      >
        {statPanelOrder
          .filter(orderIndex => statPanelConfigs[orderIndex] && !hiddenStatPanels.includes(statPanelConfigs[orderIndex].id))
          .map((orderIndex, index) => {
            const config = statPanelConfigs[orderIndex]
            if (!config) return null
            return (
              <Panel 
                key={config.id}
                id={config.id}
                index={index}
                title={config.title}
                subtitle={null}
                size={statPanelSizes[config.id]}
                onSizeChange={handleStatSizeChange}
                isDragging={isStatDragging}
                onModalOpen={() => setIsModalOpen(true)}
                onModalClose={() => setIsModalOpen(false)}
                onHide={() => handleHideStatPanel(config.id)}
                showCsv={false}
              >
                {config.content}
              </Panel>
            )
          })}
      </div>
      
      {/* 메인 패널 그리드 */}
      <div 
        ref={containerRef}
        className="dashboard-container"
        id="dashboard-container"
      >
        {panelOrder
          .filter(orderIndex => panelConfigs[orderIndex] && !hiddenPanels.includes(panelConfigs[orderIndex].id))
          .map((orderIndex, index) => {
            const config = panelConfigs[orderIndex]
            if (!config) return null
            
            // Vibration Sensor 패널의 경우에만 최신 온도값 계산 (이전값 유지)
            let temperatureValue = null
            if (config.id === 'panel7') {
              temperatureValue = vibrationTemperatureRef.current // 기본값은 이전값
              if (vibrationHistory.temperature && vibrationHistory.temperature.length > 0) {
                // 배열에서 유효한 최신값 찾기 (뒤에서부터)
                for (let i = vibrationHistory.temperature.length - 1; i >= 0; i--) {
                  const temp = vibrationHistory.temperature[i]
                  if (temp !== null && temp !== undefined && !isNaN(temp)) {
                    temperatureValue = temp
                    vibrationTemperatureRef.current = temp // ref 업데이트
                    break
                  }
                }
              }
            }
            
            return (
              <Panel 
                key={config.id}
                id={config.id}
                index={index}
                title={config.title}
                subtitle={null}
                size={panelSizes[config.id]}
                onSizeChange={handleSizeChange}
                isDragging={isDragging}
                onModalOpen={() => setIsModalOpen(true)}
                onModalClose={() => setIsModalOpen(false)}
                onHide={() => handleHidePanel(config.id)}
                temperature={config.id === 'panel7' ? temperatureValue : null}
              >
                {config.content}
              </Panel>
            )
          })}
      </div>
      
      <EditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        hiddenPanels={[...hiddenPanels, ...hiddenStatPanels]}
        panelConfigs={[...panelConfigs, ...statPanelConfigs]}
        onShowPanel={(panelId) => {
          // 통계 패널인지 확인
          if (panelId.startsWith('stat-panel')) {
            handleShowStatPanel(panelId)
          } else {
            handleShowPanel(panelId)
          }
        }}
      />
    </div>
  )
}

export default App

