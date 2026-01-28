import { useState, useMemo, useCallback } from 'react'
import { Html } from '@react-three/drei'

// Hotspot 컴포넌트 - 3D 공간에 동그라미 버튼 배치
export function Hotspot({ position, number, info, onClick, isActive = false }) {
  const [hovered, setHovered] = useState(false)
  
  // 이벤트 핸들러 최적화 - useCallback 사용
  const handleClick = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
    e.nativeEvent?.stopImmediatePropagation?.()
    onClick && onClick(number)
  }, [onClick, number])
  
  const handleMouseEnter = useCallback(() => setHovered(true), [])
  const handleMouseLeave = useCallback(() => setHovered(false), [])
  
  // 스타일 메모이제이션
  const buttonStyle = useMemo(() => ({
    width: isActive ? '32px' : '26px',
    height: isActive ? '32px' : '26px',
    borderRadius: '50%',
    border: `2px solid ${isActive ? '#4CAF50' : hovered ? '#2196F3' : '#fff'}`,
    background: isActive 
      ? 'rgba(76, 175, 80, 0.9)' 
      : hovered 
        ? 'rgba(33, 150, 243, 0.9)' 
        : 'rgba(255, 255, 255, 0.9)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 6px rgba(0,0,0,0.3)',
    transition: 'all 0.3s ease',
    pointerEvents: 'auto',
    position: 'relative',
    zIndex: 10
  }), [isActive, hovered])
  
  return (
    <Html
      position={position}
      center
      style={{ pointerEvents: 'none' }}
      userData={{ isHtml: true }}
    >
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Ripple 효과 - 활성화된 경우에만 표시 */}
        {isActive && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '4px solid rgba(76, 175, 80, 0.6)',
              animation: 'ripple 1.2s ease-out infinite',
              pointerEvents: 'none'
            }}
          />
        )}
        
        <button
          data-hotspot="true"
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={buttonStyle}
        >
          {number}
        </button>
      </div>
      
      {/* CSS 애니메이션 스타일 */}
      <style>{`
        @keyframes ripple {
          0% {
            width: 32px;
            height: 32px;
            opacity: 0.6;
          }
          100% {
            width: 60px;
            height: 60px;
            opacity: 0;
          }
        }
      `}</style>
    </Html>
  )
}
