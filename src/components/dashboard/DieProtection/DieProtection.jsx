import { useMemo, memo } from 'react'
import './DieProtection.css'

const DieProtection = memo(() => {
  // 더미 데이터 - 16개의 게이지에 대한 진행률 값 (0-100%)
  // 각 게이지는 3개의 중첩된 원형 게이지로 구성 (바깥쪽, 중간, 안쪽)
  const gauges = useMemo(() => {
    return [
      { outer: 110, middle: 0, inner: 85 },  // 1
      { outer: 0, middle: 54, inner: 41 },    // 2
      { outer: 50, middle: 38, inner: 26 },    // 3
      { outer: 92, middle: 75, inner: 58 },    // 4
      { outer: 7, middle: 61, inner: 47 },    // 5
      { outer: 65, middle: 52, inner: 39 },    // 6
      { outer: 8, middle: 6, inner: 4 },       // 7
      { outer: 78, middle: 63, inner: 48 },    // 8
      { outer: 90, middle: 66, inner: 0 },    // 9
      { outer: 55, middle: 44, inner: 33 },    // 10
      { outer: 0, middle: 0, inner: 0 },    // 11
      { outer: 0, middle: 0, inner: 0 },        // 12
      { outer: 0, middle: 0, inner: 0 },     // 13
      { outer: 0, middle: 0, inner: 0 },    // 14
      { outer: 0, middle: 0, inner: 0 },       // 15
      { outer: 0, middle: 0, inner: 0 }        // 16
    ]
  }, [])

  return (
    <div className="die-protection">
      <div className="die-protection-grid">
        {gauges.map((gauge, index) => {
          const gaugeNumber = index + 1
          
          // 모든 값이 0인지 확인
          const allZero = gauge.outer === 0 && gauge.middle === 0 && gauge.inner === 0
          
          // 각 원형 게이지의 각도 계산
          const outerAngle = (gauge.outer / 100) * 270
          const middleAngle = (gauge.middle / 100) * 270
          const innerAngle = (gauge.inner / 100) * 270
          
          // SVG arc 경로 계산 (반지름 파라미터 추가)
          const getArcPath = (startAngle, endAngle, radius) => {
            const start = (startAngle - 90) * (Math.PI / 180)
            const end = (endAngle - 90) * (Math.PI / 180)
            const x1 = 40 + radius * Math.cos(start)
            const y1 = 40 + radius * Math.sin(start)
            const x2 = 40 + radius * Math.cos(end)
            const y2 = 40 + radius * Math.sin(end)
            const largeArc = endAngle - startAngle > 180 ? 1 : 0
            return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
          }
          
          // 색상: 바깥·중간 파란색, 안쪽 찐한 보라색
          const outerColor = '#bfbfff'      // 바깥쪽
          const middleColor = '#7879ff'     // 중간
          const innerColor = '#1f1fff'      // 안쪽
          
          return (
            <div key={index} className="die-protection-gauge-item">
              <div className="die-protection-gauge">
                {/* 숫자 텍스트 - outer 게이지 왼쪽 */}
                <div className="die-protection-gauge-number">{gaugeNumber}</div>
                <svg viewBox="0 0 80 80" className="die-gauge-svg">
                  {/* 바깥쪽 배경 원 */}
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="#2d2d33"
                    strokeWidth="7"
                    className="die-gauge-background"
                  />
                  
                  {/* 중간 배경 원 - 모든 값이 0이면 숨김 */}
                  {!allZero && (
                    <circle
                      cx="40"
                      cy="40"
                      r="22"
                      fill="none"
                      stroke="#2d2d33"
                      strokeWidth="7"
                      className="die-gauge-background"
                    />
                  )}
                  
                  {/* 안쪽 배경 원 - 모든 값이 0이면 숨김 */}
                  {!allZero && (
                    <circle
                      cx="40"
                      cy="40"
                      r="12"
                      fill="none"
                      stroke="#2d2d33"
                      strokeWidth="7"
                      className="die-gauge-background"
                    />
                  )}
                  
                  {/* 바깥쪽 진행률 호 */}
                  {gauge.outer > 0 && (
                    <path
                      d={getArcPath(0, outerAngle, 32)}
                      fill="none"
                      stroke={outerColor}
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="die-gauge-progress die-gauge-outer"
                    />
                  )}
                  
                  {/* 중간 진행률 호 */}
                  {gauge.middle > 0 && (
                    <path
                      d={getArcPath(0, middleAngle, 22)}
                      fill="none"
                      stroke={middleColor}
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="die-gauge-progress die-gauge-middle"
                    />
                  )}
                  
                  {/* 안쪽 진행률 호 */}
                  {gauge.inner > 0 && (
                    <path
                      d={getArcPath(0, innerAngle, 12)}
                      fill="none"
                      stroke={innerColor}
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="die-gauge-progress die-gauge-inner"
                    />
                  )}
                </svg>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

DieProtection.displayName = 'DieProtection'

export default DieProtection
