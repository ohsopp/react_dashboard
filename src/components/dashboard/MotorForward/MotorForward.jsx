import { useMemo } from 'react'
import './MotorForward.css'

const MotorForward = () => {
  // 더미 데이터
  const value = 250
  const maxValue = 250
  const unit = 'Inch'
  
  // 게이지 각도 계산 (상단에서 시작, 시계방향으로 315도 - 10시 반 방향까지)
  const maxAngle = 315 // 10시 반 방향 (12시에서 시계방향으로 315도)
  const percentage = (value / maxValue) * 100
  const angle = (percentage / 100) * maxAngle // 315도 범위 (0~315도)
  
  // 값에 따른 색상 계산 (0: 노랑 → 연두 → 파랑 → 보라 → 핑크 → 주황 → 빨강)
  const getColorForValue = (val) => {
    const percent = Math.min((val / maxValue) * 100, 100) // 최대 100%로 제한
    
    // 색상 단계별 정의
    const colors = [
      { percent: 0, r: 250, g: 229, b: 0 },    // 노랑 (#fae500)
      { percent: 16.67, r: 124, g: 255, b: 124 }, // 연두 (#7cff7c)
      { percent: 33.33, r: 88, g: 166, b: 255 },  // 파랑 (#58a6ff)
      { percent: 50, r: 124, g: 58, b: 237 },     // 보라 (#7c3aed)
      { percent: 66.67, r: 255, g: 105, b: 180 }, // 핑크 (#ff69b4)
      { percent: 83.33, r: 255, g: 140, b: 0 },   // 주황 (#ff8c00)
      { percent: 100, r: 255, g: 38, b: 38 }      // 빨강 (#ff2626)
    ]
    
    // 현재 percent에 해당하는 색상 구간 찾기
    for (let i = 0; i < colors.length - 1; i++) {
      if (percent <= colors[i + 1].percent) {
        const ratio = (percent - colors[i].percent) / (colors[i + 1].percent - colors[i].percent)
        const r = Math.round(colors[i].r + (colors[i + 1].r - colors[i].r) * ratio)
        const g = Math.round(colors[i].g + (colors[i + 1].g - colors[i].g) * ratio)
        const b = Math.round(colors[i].b + (colors[i + 1].b - colors[i].b) * ratio)
        return `rgb(${r}, ${g}, ${b})`
      }
    }
    
    // 100%일 때 빨강색 반환
    return `rgb(${colors[colors.length - 1].r}, ${colors[colors.length - 1].g}, ${colors[colors.length - 1].b})`
  }
  
  // 호를 따라 그라데이션 적용을 위한 세그먼트 생성 (겹침으로 자연스러운 연결)
  const segmentCount = 150 // 세그먼트 개수 증가로 더 부드러운 그라데이션
  const segments = useMemo(() => {
    const segs = []
    const segmentAngle = angle / segmentCount
    for (let i = 0; i < segmentCount; i++) {
      const startAngle = i * segmentAngle
      const endAngle = (i + 1) * segmentAngle
      const segmentValue = (startAngle / maxAngle) * maxValue
      const segmentColor = getColorForValue(segmentValue)
      // 세그먼트를 약간 겹치게 하여 연결 끊김 방지
      const overlap = 0.3 // 겹침 각도
      segs.push({ 
        startAngle: i === 0 ? 0 : startAngle - overlap, // 첫 번째 세그먼트는 정확히 0에서 시작
        endAngle: i === segmentCount - 1 ? endAngle : endAngle + overlap, 
        color: segmentColor 
      })
    }
    return segs
  }, [angle, maxValue, maxAngle])
  
  // SVG arc 경로 계산 (12시 방향에서 시작)
  // SVG 좌표계에서 0도는 3시 방향, 12시 방향은 -90도 (또는 270도)
  const centerX = 125 // viewBox 중심 X
  const centerY = 125 // viewBox 중심 Y
  const radius = 95 // 반지름 증가
  
  const getArcPath = (startAngle, endAngle) => {
    // 12시 방향에서 시작하도록 -90도 오프셋 적용
    const start = (startAngle - 90) * (Math.PI / 180)
    const end = (endAngle - 90) * (Math.PI / 180)
    const x1 = centerX + radius * Math.cos(start)
    const y1 = centerY + radius * Math.sin(start)
    const x2 = centerX + radius * Math.cos(end)
    const y2 = centerY + radius * Math.sin(end)
    const largeArc = endAngle - startAngle > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
  }
  
  // 눈금 위치 계산
  const scaleMarks = useMemo(() => {
    const marks = []
    const markCount = 5
    for (let i = 0; i <= markCount; i++) {
      const markValue = (i / markCount) * maxValue
      const markAngle = (i / markCount) * maxAngle
      marks.push({ value: markValue, angle: markAngle })
    }
    return marks
  }, [maxValue, maxAngle])

  return (
    <div className="motor-forward">
      <div className="motor-forward-gauge">
        <svg viewBox="0 0 250 250" className="gauge-svg">
          <defs>
            {/* 글로우 필터 */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* 배경 호 - 최댓값 위치보다 조금 더 길게 */}
          <path
            d={getArcPath(0, maxAngle)}
            fill="none"
            stroke="#2d2d33"
            strokeWidth="24"
            strokeLinecap="round"
            className="gauge-background"
          />
          
          {/* 진행률 호 - 세그먼트별로 색상 적용 (호를 따라 그라데이션) */}
          {segments.map((segment, index) => (
            <path
              key={index}
              d={getArcPath(segment.startAngle, segment.endAngle)}
              fill="none"
              stroke={segment.color}
              strokeWidth="22"
              strokeLinecap="round"
              className="gauge-progress"
              filter="url(#glow)"
            />
          ))}
          
          {/* 눈금 표시 */}
          {scaleMarks.map((mark, index) => {
            // 12시 방향에서 시작하도록 -90도 오프셋 적용
            const radian = ((mark.angle - 90) * Math.PI) / 180
            const x1 = centerX + 85 * Math.cos(radian)
            const y1 = centerY + 85 * Math.sin(radian)
            const x2 = centerX + 95 * Math.cos(radian)
            const y2 = centerY + 95 * Math.sin(radian)
            
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
                  x={centerX + 105 * Math.cos(radian)}
                  y={centerY + 105 * Math.sin(radian)}
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
