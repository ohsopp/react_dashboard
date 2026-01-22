import { useState, useRef, useEffect } from 'react'
import './Panel.css'
import PanelModal from '../PanelModal/PanelModal'
import PanelHeader from '../PanelHeader/PanelHeader'
import CsvDownloadModal from '../CsvDownloadModal/CsvDownloadModal'
import expandIcon from '../../../assets/icons/expand_icon.png'

// Panel 컴포넌트
const Panel = ({ title, subtitle, children, className = '', size = 1, onSizeChange, id, index, isDragging, onModalOpen, onModalClose, onHide, temperature }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [showExtensionButton, setShowExtensionButton] = useState(false)
  const justFinishedResizing = useRef(false)
  const panelRef = useRef(null)
  const resizeHandleRef = useRef(null)
  const extensionButtonRef = useRef(null)

  useEffect(() => {
    if (panelRef.current) {
      const updateSize = () => {
        const rect = panelRef.current.getBoundingClientRect()
        setPanelSize({
          width: rect.width,
          height: rect.height
        })
      }
      
      updateSize()
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }
  }, [size])

  const handlePanelMouseEnter = () => {
    // 카드 패널(통계 패널)은 hover해도 확장 버튼 표시 안 함
    if (id && id.startsWith('stat-panel')) {
      return
    }
    
    // 드래그 중이면 확장 버튼 표시 안 함
    if (isDragging) {
      return
    }
    
    // 확장 버튼 표시 (리사이징 중에도 표시)
    setShowExtensionButton(true)
  }

  const handleExtensionButtonClick = (e) => {
    e.stopPropagation()
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect()
      setPanelSize({
        width: rect.width,
        height: rect.height
      })
    }
    setIsModalOpen(true)
    setShowExtensionButton(false)
    if (onModalOpen) {
      onModalOpen()
    }
  }

  const handlePanelMouseLeave = () => {
    // 리사이징 중이면 확장 버튼 유지
    if (isResizing) {
      return
    }
    
    // 패널에서 마우스가 벗어나면 확장 버튼 숨기기
    setShowExtensionButton(false)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    if (onModalClose) {
      onModalClose()
    }
  }

  const handleResizeHandleClick = (e) => {
    e.stopPropagation()
  }

  const handlePanelMouseUp = (e) => {
    // 리사이즈가 방금 끝났다면 클릭 이벤트 전파 방지
    if (justFinishedResizing.current) {
      e.stopPropagation()
    }
  }

  const handleResizeStart = (e) => {
    e.stopPropagation()
    setIsResizing(true)
    
    // 리사이징 중에도 확장 버튼 표시
    if (!id?.startsWith('stat-panel')) {
      setShowExtensionButton(true)
    }
    
    // 리사이징 중 body에 클래스 추가 (전체 UX 개선)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    
    const startX = e.clientX
    const startSize = size
    const gridColumns = 12 // 12분할 그리드

    // 허용된 크기 목록 (1/4, 1/3, 2/4, 2/3, 3/4, 1)
    // panel8 (Sensor Information)은 최소 8(2/3)이므로 8 이상만 허용
    const baseAllowedSizes = [3, 4, 6, 8, 9, 12] // 12분할 기준
    const allowedSizes = id === 'panel8' 
      ? baseAllowedSizes.filter(size => size >= 8)
      : baseAllowedSizes
    
    let lastAppliedSize = startSize // 마지막으로 적용된 크기 추적
    let currentSize = startSize // 현재 크기 추적 (비동기 상태 업데이트 대응)
    let lastUpdateTime = Date.now()
    const updateThrottle = 16 // ~60fps

    const handleMouseMove = (e) => {
      const now = Date.now()
      // 성능 최적화: 60fps로 제한
      if (now - lastUpdateTime < updateThrottle) return
      lastUpdateTime = now
      
      const deltaX = e.clientX - startX
      const container = panelRef.current?.parentElement
      if (!container) return
      
      const containerWidth = container.getBoundingClientRect().width
      const padding = 24 * 2 // 좌우 padding
      const gap = 12
      const availableWidth = containerWidth - padding
      
      // gap을 고려한 실제 컬럼 너비 계산
      // 12개 컬럼이면 11개의 gap이 있음
      const totalGapWidth = gap * 11
      const columnWidth = (availableWidth - totalGapWidth) / gridColumns
      const totalColumnWidth = columnWidth + gap
      
      // deltaX를 컬럼 단위로 변환 (반올림 없이 정확한 계산)
      const deltaColumns = deltaX / totalColumnWidth
      const targetSize = startSize + deltaColumns
      
      // 가장 가까운 허용된 크기 찾기 (더 부드러운 스냅을 위해 임계값 추가)
      let newSize = allowedSizes.reduce((prev, curr) => {
        return Math.abs(curr - targetSize) < Math.abs(prev - targetSize) ? curr : prev
      })
      
      // panel8 (Sensor Information)은 최소 8(2/3)로 제한, 다른 패널은 최소 3(1/4)
      const minSize = id === 'panel8' ? 8 : 3
      // 최대 12(1)로 제한
      newSize = Math.max(minSize, Math.min(12, newSize))
      
      // 마지막으로 적용된 크기와 다를 때만 업데이트
      // 이렇게 하면 모든 사이즈를 순차적으로 적용할 수 있음
      if (newSize !== lastAppliedSize) {
        lastAppliedSize = newSize
        currentSize = newSize
        if (onSizeChange) {
          onSizeChange(id, newSize)
        }
      }
    }

    const handleMouseUp = (e) => {
      // mouseup 이벤트 전파 방지 (패널 클릭 이벤트 트리거 방지)
      if (e) {
        e.stopPropagation()
      }
      
      // body 스타일 복원
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      
      setIsResizing(false)
      justFinishedResizing.current = true
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      // 리사이즈 종료 후 짧은 시간 동안 클릭 무시 (mouseup -> click 이벤트 순서 문제 해결)
      setTimeout(() => {
        justFinishedResizing.current = false
      }, 100)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <>
      <div 
        ref={panelRef}
        id={id}
        className={`panel ${className} ${isResizing ? 'resizing' : ''}`}
        data-panel-id={id}
        data-panel-width={size}
        onMouseUp={handlePanelMouseUp}
        onMouseEnter={handlePanelMouseEnter}
        onMouseLeave={handlePanelMouseLeave}
        style={{ 
          cursor: isResizing ? 'ew-resize' : 'default',
          gridColumn: `span ${size}`
        }}
      >
        {title && (
          <PanelHeader
            title={title}
            subtitle={subtitle}
            onHide={onHide}
            onCsvClick={() => setIsCsvModalOpen(true)}
            showCsv={id && !id.startsWith('stat-panel') && id !== 'panel8'}
            showExtension={id !== 'panel8'}
            temperature={temperature}
          >
            {/* 확장 버튼을 헤더 내부로 이동 */}
            {!id?.startsWith('stat-panel') && id !== 'panel8' && showExtensionButton && (
              <button
                ref={extensionButtonRef}
                className="panel-extension-button"
                onClick={handleExtensionButtonClick}
                title="확장하여 크게 보기"
              >
                <img src={expandIcon} alt="확장" />
              </button>
            )}
          </PanelHeader>
        )}
        <div className="panel-content">
          {children}
        </div>
        <div 
          ref={resizeHandleRef}
          className="panel-resize-handle"
          onClick={handleResizeHandleClick}
          onMouseDown={handleResizeStart}
        />
      </div>
      
      <PanelModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={title}
        subtitle={subtitle}
        temperature={temperature}
      >
        {children}
      </PanelModal>
      
      <CsvDownloadModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        panelId={id}
      />
    </>
  );
};

export default Panel;

