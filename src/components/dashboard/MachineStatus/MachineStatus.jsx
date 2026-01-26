import { useState, useEffect, memo } from 'react'
import './MachineStatus.css'

const MachineStatus = memo(({ onChartClick, machineData, setMachineData }) => {
  // 공통 데이터 사용
  const timer = machineData?.timer || 0
  const dieNo = machineData?.dieNo || 62
  const producedParts = machineData?.producedParts || 835
  const strokeRate = machineData?.strokeRate || 19
  const productionEfficiency = machineData?.productionEfficiency || 65
  const status = machineData?.status || 'PRODUCING'
  const dieProtection = machineData?.dieProtection || true

  // 타이머 업데이트 (1초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      if (setMachineData) {
        setMachineData(prev => ({
          ...prev,
          timer: (prev.timer || 0) + 1
        }))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [setMachineData])

  // 생산 중일 때 produced parts와 stroke rate 업데이트
  useEffect(() => {
    if (status === 'PRODUCING' && setMachineData) {
      const interval = setInterval(() => {
        setMachineData(prev => {
          const newStrokeRate = Math.max(15, Math.min(25, Math.round((prev.strokeRate || 19) + (Math.random() - 0.5) * 2)))
          const newProductionEfficiency = Math.max(60, Math.min(75, Math.round((prev.productionEfficiency || 65) + (Math.random() - 0.5) * 2)))
          const newProducedParts = (prev.producedParts || 835) + Math.floor(newStrokeRate / 60)
          
          // OEE도 productionEfficiency와 동기화
          return {
            ...prev,
            producedParts: newProducedParts,
            strokeRate: newStrokeRate,
            productionEfficiency: newProductionEfficiency,
            oee: newProductionEfficiency,
            actualParts: newProducedParts
          }
        })
      }, 5000) // 5초마다 업데이트
      return () => clearInterval(interval)
    }
  }, [status, setMachineData])

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

      {/* 차트 버튼 - 금형 보호 아래 */}
      {onChartClick && (
        <button 
          className="machine-chart-button"
          onClick={onChartClick}
          title="Shift Report 보기"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"></path>
            <path d="M18 17V9"></path>
            <path d="M13 17V5"></path>
            <path d="M8 17v-3"></path>
          </svg>
          <span>Shift Report</span>
        </button>
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
