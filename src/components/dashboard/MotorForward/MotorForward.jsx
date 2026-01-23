import { useMemo } from 'react'
import './MotorForward.css'

const MotorForward = () => {
  // 더미 데이터
  const value = 70
  const maxValue = 250
  const unit = 'Inch'
  
  // 게이지 각도 계산 (상단에서 시작, 시계방향으로 270도)
  const percentage = (value / maxValue) * 100
  const angle = (percentage / 100) * 270 // 270도 범위 (0~270도)
  
  // SVG arc 경로 계산 (12시 방향에서 시작)
  // SVG 좌표계에서 0도는 3시 방향, 12시 방향은 -90도 (또는 270도)
  const getArcPath = (startAngle, endAngle) => {
    // 12시 방향에서 시작하도록 -90도 오프셋 적용
    const start = (startAngle - 90) * (Math.PI / 180)
    const end = (endAngle - 90) * (Math.PI / 180)
    const x1 = 100 + 85 * Math.cos(start)
    const y1 = 100 + 85 * Math.sin(start)
    const x2 = 100 + 85 * Math.cos(end)
    const y2 = 100 + 85 * Math.sin(end)
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    return `M ${x1} ${y1} A 85 85 0 ${largeArc} 1 ${x2} ${y2}`
  }
  
  // 눈금 위치 계산
  const scaleMarks = useMemo(() => {
    const marks = []
    const markCount = 5
    for (let i = 0; i <= markCount; i++) {
      const markValue = (i / markCount) * maxValue
      const markAngle = (i / markCount) * 270
      marks.push({ value: markValue, angle: markAngle })
    }
    return marks
  }, [maxValue])

  return (
    <div className="motor-forward">
      <div className="motor-forward-gauge">
        <svg viewBox="0 0 200 200" className="gauge-svg">
          <defs>
            {/* 그라데이션 정의 */}
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6eb3ff" stopOpacity="1" />
              <stop offset="50%" stopColor="#58a6ff" stopOpacity="1" />
              <stop offset="100%" stopColor="#3d7bd6" stopOpacity="1" />
            </linearGradient>
            {/* 글로우 필터 */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* 배경 원 */}
          <circle
            cx="100"
            cy="100"
            r="85"
            fill="none"
            stroke="#2d2d33"
            strokeWidth="18"
            className="gauge-background"
          />
          
          {/* 진행률 호 */}
          <path
            d={getArcPath(0, angle)}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="18"
            strokeLinecap="round"
            className="gauge-progress"
            filter="url(#glow)"
          />
          
          {/* 눈금 표시 */}
          {scaleMarks.map((mark, index) => {
            // 12시 방향에서 시작하도록 -90도 오프셋 적용
            const radian = ((mark.angle - 90) * Math.PI) / 180
            const x1 = 100 + 75 * Math.cos(radian)
            const y1 = 100 + 75 * Math.sin(radian)
            const x2 = 100 + 85 * Math.cos(radian)
            const y2 = 100 + 85 * Math.sin(radian)
            
            return (
              <g key={index}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#8e9196"
                  strokeWidth="2"
                  className="gauge-mark"
                />
                {/* 눈금 값 표시 */}
                <text
                  x={100 + 95 * Math.cos(radian)}
                  y={100 + 95 * Math.sin(radian)}
                  fill="#8e9196"
                  fontSize="8"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="gauge-mark-label"
                >
                  {Math.round(mark.value)}
                </text>
              </g>
            )
          })}
        </svg>
        
        {/* 중앙 값 표시 */}
        <div className="gauge-center">
          <div className="gauge-value">{value}</div>
          <div className="gauge-unit">{unit}</div>
        </div>
      </div>
    </div>
  )
}

export default MotorForward
