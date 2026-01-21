import { useState, useEffect, useRef } from 'react'
import './PanelHeader.css'

// Vibration Sensor 전용 온도 표시 컴포넌트
const VibrationTemperatureIndicator = ({ temperature }) => {
  // 이전 온도값 유지 (깜빡임 방지)
  const [displayTemperature, setDisplayTemperature] = useState(null)
  const prevTemperatureRef = useRef(null)

  // 새로운 온도값이 있으면 업데이트, 없으면 이전값 유지
  useEffect(() => {
    if (temperature !== null && temperature !== undefined && !isNaN(temperature)) {
      setDisplayTemperature(temperature)
      prevTemperatureRef.current = temperature
    } else if (prevTemperatureRef.current !== null) {
      // 새로운 값이 없으면 이전값 유지
      setDisplayTemperature(prevTemperatureRef.current)
    }
  }, [temperature])

  // 온도에 따른 색상 결정
  const getTemperatureColor = (temp) => {
    if (temp === null || temp === undefined || isNaN(temp)) return 'disconnected'
    if (temp >= 20 && temp <= 50) return 'normal'      // 정상: 녹색
    if (temp >= 51 && temp <= 65) return 'warning'     // 주의: 노랑
    if (temp >= 66 && temp <= 80) return 'caution'     // 이상: 주황 (65 초과 80 이하)
    if (temp > 80) return 'danger'                     // 경고: 빨강
    return 'disconnected'                               // 데이터 없음
  }

  const temperatureColor = displayTemperature !== null && displayTemperature !== undefined && !isNaN(displayTemperature) 
    ? getTemperatureColor(displayTemperature) 
    : 'disconnected'
  const temperatureValue = displayTemperature !== null && displayTemperature !== undefined && !isNaN(displayTemperature)
    ? `${displayTemperature.toFixed(1)}°C`
    : '--'

  if (displayTemperature === null || displayTemperature === undefined) {
    return null
  }

  return (
    <div className="panel-temperature-indicator">
      <span className={`temperature-status-indicator ${temperatureColor}`}></span>
      <span className="temperature-value">{temperatureValue}</span>
    </div>
  )
}

export default VibrationTemperatureIndicator
