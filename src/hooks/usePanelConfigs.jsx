import { useMemo } from 'react'
import Chart from '../components/dashboard/Chart/Chart'
import SensorInfo from '../components/dashboard/SensorInfo/SensorInfo'

// 일반 패널 그래프 grid 설정
const DEFAULT_PANEL_GRID = {
  left: '25px',
  right: '25px',
  bottom: '10px',
  top: '10%'
}

export const usePanelConfigs = ({
  temperature,
  temperatureHistory,
  vibrationHistory,
  selectedRange,
  dataZoomRange,
  setDataZoomRange,
  networkStatus
}) => {
  // 탁도/유량/초음파용 1시간 더미 데이터 (5분 간격 13점)
  const dummy1hChartData = useMemo(() => {
    const base = Date.now() - 3600000
    const interval = 5 * 60 * 1000
    const timestamps = []
    for (let i = 0; i <= 12; i++) timestamps.push(base + i * interval)
    const labels = timestamps.map(ts => {
      const d = new Date(ts)
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    })
    const turbidityValues = [12, 15, 18, 22, 28, 25, 30, 35, 32, 38, 40, 36, 42]
    const flowValues = [20, 25, 35, 45, 55, 50, 60, 65, 70, 62, 58, 52, 48]
    const ultrasonicValues = [80, 95, 110, 125, 140, 130, 150, 165, 155, 170, 160, 145, 135]
    return {
      timestamps,
      labels,
      turbidity: { timestamps, labels, datasets: [{ label: 'Turbidity', data: turbidityValues, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)' }] },
      flow: { timestamps, labels, datasets: [{ label: 'Flow', data: flowValues, borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.15)' }] },
      ultrasonic: { timestamps, labels, datasets: [{ label: 'Ultrasonic', data: ultrasonicValues, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)' }] }
    }
  }, [])

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
        title: 'Vibration History',
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
      },
      {
        id: 'panel12',
        title: 'Turbidity History',
        content: (
          <Chart
            type="line"
            data={dummy1hChartData.turbidity}
            timeRange="1h"
            options={{
              animation: false,
              sampling: 'lttb',
              grid: DEFAULT_PANEL_GRID,
              yAxis: { 
                min: 0, 
                max: 50, 
                name: 'Turbidity (NTU)',
                nameTextStyle: {
                  fontSize: 10,
                  color: '#9ca3af'
                },
                axisLabel: {
                  fontSize: 10,
                  color: '#9ca3af'
                },
                splitLine: {
                  lineStyle: {
                    color: 'rgba(180, 185, 190, 0.3)'
                  }
                }
              }
            }}
          />
        )
      },
      {
        id: 'panel13',
        title: 'Flow history',
        content: (
          <Chart
            type="line"
            data={dummy1hChartData.flow}
            timeRange="1h"
            options={{
              animation: false,
              sampling: 'lttb',
              grid: DEFAULT_PANEL_GRID,
              yAxis: { 
                min: 0, 
                max: 80, 
                name: 'Flow (L/min)',
                nameTextStyle: {
                  fontSize: 10,
                  color: '#9ca3af'
                },
                axisLabel: {
                  fontSize: 10,
                  color: '#9ca3af'
                },
                splitLine: {
                  lineStyle: {
                    color: 'rgba(180, 185, 190, 0.3)'
                  }
                }
              }
            }}
          />
        )
      },
      {
        id: 'panel14',
        title: 'Ultrasonic History',
        content: (
          <Chart
            type="line"
            data={dummy1hChartData.ultrasonic}
            timeRange="1h"
            options={{
              animation: false,
              sampling: 'lttb',
              grid: DEFAULT_PANEL_GRID,
              yAxis: { 
                min: 0, 
                max: 200, 
                name: 'Level (mm)',
                nameTextStyle: {
                  fontSize: 10,
                  color: '#9ca3af'
                },
                axisLabel: {
                  fontSize: 10,
                  color: '#9ca3af'
                },
                splitLine: {
                  lineStyle: {
                    color: 'rgba(180, 185, 190, 0.3)'
                  }
                }
              }
            }}
          />
        )
      }
      ]
    }, [temperature, temperatureHistory, vibrationHistory, selectedRange, dataZoomRange, dummy1hChartData, setDataZoomRange])

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
  }, [temperature, temperatureHistory, vibrationHistory, networkStatus])

  return {
    panelConfigs,
    statPanelConfigs
  }
}
