import { useState, useEffect, useRef } from 'react'
import './PanelModal.css'
import PanelHeader from '../PanelHeader/PanelHeader'

// PanelModal 컴포넌트 - Panel의 내용을 재사용하는 모달 껍데기
const PanelModal = ({ isOpen, onClose, title, subtitle, children, temperature }) => {
  const [isReady, setIsReady] = useState(false)
  const contentRef = useRef(null)

  // 모달이 열릴 때 DOM이 준비될 때까지 대기
  useEffect(() => {
    if (isOpen) {
      setIsReady(false)
      // 모달 애니메이션 완료 후 DOM 크기 확인
      const timer = setTimeout(() => {
        if (contentRef.current) {
          const { clientWidth, clientHeight } = contentRef.current
          if (clientWidth > 0 && clientHeight > 0) {
            setIsReady(true)
          } else {
            // 재시도
            const retryTimer = setTimeout(() => {
              if (contentRef.current) {
                const { clientWidth: w, clientHeight: h } = contentRef.current
                if (w > 0 && h > 0) {
                  setIsReady(true)
                }
              }
            }, 200)
            return () => clearTimeout(retryTimer)
          }
        }
      }, 350) // 애니메이션 시간(300ms) + 여유시간

      return () => clearTimeout(timer)
    } else {
      setIsReady(false)
    }
  }, [isOpen])

  if (!isOpen) return null;

  return (
    <div className="panel-modal-overlay" onMouseDown={onClose}>
      <div 
        className="panel-modal" 
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="panel-modal-header-wrapper">
            <PanelHeader
              title={title}
              subtitle={subtitle}
              temperature={temperature}
            />
            <button className="panel-modal-close" onClick={onClose}>×</button>
          </div>
        )}
        <div className="panel-modal-content" ref={contentRef}>
          {/* DOM이 준비된 후에만 children 렌더링 (Chart 오류 방지) */}
          {isReady ? children : <div style={{ padding: '20px', textAlign: 'center', color: '#7d8590' }}>로딩 중...</div>}
        </div>
      </div>
    </div>
  );
};

export default PanelModal;

