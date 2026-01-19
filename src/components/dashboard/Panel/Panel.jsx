import { useState, useRef, useEffect } from 'react'
import './Panel.css'
import PanelModal from '../PanelModal/PanelModal'
import PanelHeader from '../PanelHeader/PanelHeader'
import CsvDownloadModal from '../CsvDownloadModal/CsvDownloadModal'

// Panel 컴포넌트
const Panel = ({ title, subtitle, children, className = '', size = 1, onSizeChange, id, index, isDragging, onModalOpen, onModalClose, onHide }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const justFinishedResizing = useRef(false)
  const panelRef = useRef(null)
  const resizeHandleRef = useRef(null)

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

  const handlePanelClick = (e) => {
    // 리사이즈 중이거나 방금 리사이즈가 끝났거나 드래그 중이거나 리사이즈 핸들 클릭 시 모달 열기 방지
    // 차트 컨테이너나 슬라이더 영역 클릭 시에도 모달 열기 방지
    if (isResizing || justFinishedResizing.current || isDragging || 
        e.target === resizeHandleRef.current || 
        resizeHandleRef.current?.contains(e.target) ||
        e.target.closest('.chart-container') ||
        e.target.closest('.echarts-for-react')) {
      return
    }
    
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect()
      setPanelSize({
        width: rect.width,
        height: rect.height
      })
    }
    setIsModalOpen(true)
    if (onModalOpen) {
      onModalOpen()
    }
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
    
    // 리사이징 중 body에 클래스 추가 (전체 UX 개선)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    
    const startX = e.clientX
    const startSize = size
    const gridColumns = 12 // 12분할 그리드

    // 허용된 크기 목록 (1/4, 1/3, 2/4, 2/3, 3/4, 1)
    const allowedSizes = [3, 4, 6, 8, 9, 12] // 12분할 기준
    
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
      
      // 최소 3(1/4), 최대 12(1)로 제한
      newSize = Math.max(3, Math.min(12, newSize))
      
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
        className={`panel ${className} ${isResizing ? 'resizing' : ''}`}
        data-panel-id={id}
        data-panel-width={size}
        onClick={handlePanelClick}
        onMouseUp={handlePanelMouseUp}
        style={{ 
          cursor: isResizing ? 'ew-resize' : 'grab',
          gridColumn: `span ${size}`
        }}
      >
        {title && (
          <PanelHeader
            title={title}
            subtitle={subtitle}
            onHide={onHide}
            onCsvClick={() => setIsCsvModalOpen(true)}
            showCsv={id && !id.startsWith('stat-panel')}
          />
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

