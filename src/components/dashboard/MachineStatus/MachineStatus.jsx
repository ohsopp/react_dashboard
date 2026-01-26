import { useState, useEffect, memo } from 'react'
import './MachineStatus.css'

const MachineStatus = memo(() => {
  // 더미 데이터
  const [timer, setTimer] = useState(0) // 초 단위
  const [dieNo, setDieNo] = useState(62)
  const [producedParts, setProducedParts] = useState(835)
  const [strokeRate, setStrokeRate] = useState(19)
  const [productionEfficiency, setProductionEfficiency] = useState(65)
  const [status, setStatus] = useState('PRODUCING') // PRODUCING, SETUP, ERROR
  const [dieProtection, setDieProtection] = useState(true)

  // 타이머 업데이트 (1초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // 생산 중일 때 produced parts와 stroke rate 업데이트
  useEffect(() => {
    if (status === 'PRODUCING') {
      const interval = setInterval(() => {
        // stroke rate에 따라 produced parts 증가 (대략적으로)
        setProducedParts(prev => prev + Math.floor(strokeRate / 60))
        // stroke rate는 약간 변동
        setStrokeRate(prev => {
          const change = (Math.random() - 0.5) * 2 // -1 ~ +1
          return Math.max(15, Math.min(25, Math.round(prev + change)))
        })
        // production efficiency도 약간 변동
        setProductionEfficiency(prev => {
          const change = (Math.random() - 0.5) * 2 // -1 ~ +1
          return Math.max(60, Math.min(75, Math.round(prev + change)))
        })
      }, 5000) // 5초마다 업데이트
      return () => clearInterval(interval)
    }
  }, [status, strokeRate])

  // 타이머 포맷팅 (HH:MM:SS)
  const formatTimer = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // 상태에 따른 색상
  const getStatusColor = () => {
    switch (status) {
      case 'PRODUCING':
        return '#4ade80' // 녹색
      case 'SETUP':
        return '#fbbf24' // 노란색
      case 'ERROR':
        return '#ef4444' // 빨간색
      default:
        return '#6b7280' // 회색
    }
  }

  // Production efficiency 원형 게이지 계산
  const efficiencyAngle = (productionEfficiency / 100) * 360
  const radius = 70
  const centerX = 90
  const centerY = 90
  const circumference = 2 * Math.PI * radius

  return (
    <div className="machine-status">
      {/* 상태 및 타이머 */}
      <div className="machine-status-header">
        <div 
          className="status-badge"
          style={{ backgroundColor: getStatusColor() }}
        >
          {status}
        </div>
        <div className="timer">{formatTimer(timer)}</div>
      </div>

      {/* 머신 정보 */}
      <div className="machine-info">
        <div className="info-row">
          <span className="info-label">die no. loaded</span>
          <span className="info-value">{dieNo}</span>
        </div>
        <div className="info-row">
          <span className="info-label">produced parts</span>
          <span className="info-value">{producedParts} pt</span>
        </div>
        <div className="info-row">
          <span className="info-label">current stroke rate</span>
          <span className="info-value">{strokeRate} 1/min</span>
        </div>
      </div>

      {/* Die Protection 상태 */}
      {dieProtection && (
        <div className="die-protection-status">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" fill="#4ade80" />
            <path d="M5 8L7 10L11 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>금형 보호 활성화</span>
        </div>
      )}

      {/* Production Efficiency 게이지 */}
      <div className="efficiency-gauge-container">
        <div className="efficiency-gauge">
          <svg width="180" height="180" viewBox="0 0 180 180" className="gauge-svg">
            <defs>
              <linearGradient id="efficiencyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ade80" stopOpacity="1" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="1" />
              </linearGradient>
            </defs>
            {/* 배경 원 */}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke="#2d2d33"
              strokeWidth="12"
            />
            {/* 진행률 원 */}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="none"
              stroke="url(#efficiencyGradient)"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (efficiencyAngle / 360) * circumference}
              strokeLinecap="round"
              transform={`rotate(-90 ${centerX} ${centerY})`}
              className="efficiency-circle"
            />
          </svg>
          <div className="efficiency-value">
            <div className="efficiency-percent">{productionEfficiency}%</div>
          </div>
        </div>
        <div className="efficiency-label">production efficiency</div>
      </div>

      {/* Last Data Update */}
      <div className="last-update">
        Last Data Update {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
    </div>
  )
})

MachineStatus.displayName = 'MachineStatus'

export default MachineStatus
