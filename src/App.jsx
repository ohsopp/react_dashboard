import { useState, useEffect, useRef } from 'react'
import Sortable from 'sortablejs'
import './App.css'
import { Panel, TopBar, DataRangeSelector, EditModal } from './components'

function App() {
  const [selectedRange, setSelectedRange] = useState('1h')
  
  const getSubtitle = () => {
    const rangeMap = {
      '1h': 'Last 1 hour',
      '6h': 'Last 6 hours',
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days'
    }
    return rangeMap[selectedRange] || 'Last 1 hour'
  }

  const panelConfigs = [
    { id: 'panel1', title: 'Temperature History', content: <div className="panel-placeholder"><p>차트 영역 (나중에 그래프 추가 예정)</p></div> },
    { id: 'panel2', title: 'Vibration Sensor', content: <div className="panel-placeholder"><p>차트 영역 (나중에 그래프 추가 예정)</p></div> },
    { id: 'panel3', title: 'Crest Sensor', content: <div className="panel-placeholder"><p>차트 영역 (나중에 그래프 추가 예정)</p></div> },
    { id: 'panel4', title: 'Temperature Statistics', content: <div className="stat-panel"><div className="stat-label">평균</div><div className="stat-value">24.6°C</div></div> },
    { id: 'panel5', title: 'Humidity Statistics', content: <div className="stat-panel"><div className="stat-label">평균</div><div className="stat-value">--</div></div> },
    { id: 'panel6', title: 'Data Points', content: <div className="stat-panel"><div className="stat-value-large">1,419</div></div> },
  ]

  const [panelSizes, setPanelSizes] = useState({
    panel1: 12, // 전체
    panel2: 6,  // 2/4
    panel3: 6,  // 2/4
    panel4: 4,  // 1/3
    panel5: 4,  // 1/3
    panel6: 4,  // 1/3
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const sortableInstance = useRef(null)
  const containerRef = useRef(null)
  const panelOrderRef = useRef(panelConfigs.map((_, index) => index))
  const panelSizesRef = useRef({
    panel1: 12,
    panel2: 6,
    panel3: 6,
    panel4: 4,
    panel5: 4,
    panel6: 4,
  })

  const [panelOrder, setPanelOrder] = useState(panelConfigs.map((_, index) => index))
  const [hiddenPanels, setHiddenPanels] = useState(() => {
    // localStorage에서 숨겨진 패널 로드
    try {
      const saved = localStorage.getItem('hidden-panels')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('숨겨진 패널 로드 실패:', e)
    }
    return []
  })

  // ref 업데이트
  useEffect(() => {
    panelOrderRef.current = panelOrder
  }, [panelOrder])

  useEffect(() => {
    panelSizesRef.current = panelSizes
  }, [panelSizes])

  const handleSizeChange = (panelId, newSize) => {
    setPanelSizes(prev => ({
      ...prev,
      [panelId]: newSize
    }))
    // 레이아웃 저장
    setTimeout(() => saveLayout(), 0)
  }

  // 그리드 레이아웃에서 각 패널이 속한 줄을 계산
  const calculateRowLayout = (order, sizes = null) => {
    const currentSizes = sizes || panelSizesRef.current
    const rows = []
    let currentRow = []
    let currentRowWidth = 0

    order.forEach((orderIndex) => {
      const config = panelConfigs[orderIndex]
      const panelSize = currentSizes[config.id]
      
      if (currentRowWidth + panelSize > 12) {
        rows.push([...currentRow])
        currentRow = [orderIndex]
        currentRowWidth = panelSize
      } else {
        currentRow.push(orderIndex)
        currentRowWidth += panelSize
      }
    })
    
    if (currentRow.length > 0) {
      rows.push(currentRow)
    }
    
    return rows
  }

  // 드롭 위치의 줄에서 빈 공간 계산
  const calculateEmptySpace = (order, dropIndex, sizes = null) => {
    const currentSizes = sizes || panelSizesRef.current
    const rows = calculateRowLayout(order, currentSizes)
    let currentIndex = 0
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowStartIndex = currentIndex
      const rowEndIndex = currentIndex + row.length - 1
      
      if (dropIndex >= rowStartIndex && dropIndex <= rowEndIndex) {
        let rowWidth = 0
        row.forEach(orderIndex => {
          const config = panelConfigs[orderIndex]
          rowWidth += currentSizes[config.id]
        })
        return 12 - rowWidth
      }
      
      currentIndex += row.length
    }
    
    return 12 // 완전히 빈 줄
  }

  // 패널 순서 업데이트
  const updatePanelOrder = () => {
    if (!containerRef.current) return
    
    const panels = Array.from(containerRef.current.querySelectorAll('.panel:not(.hidden)'))
    const newOrder = panels.map(panel => {
      const panelId = panel.getAttribute('data-panel-id')
      const index = panelConfigs.findIndex(config => config.id === panelId)
      return index !== -1 ? index : null
    }).filter(index => index !== null)
    
    setPanelOrder(newOrder)
  }

  // 패널 숨기기
  const handleHidePanel = (panelId) => {
    setHiddenPanels(prev => {
      // 이미 숨겨진 패널이면 추가하지 않음
      if (prev.includes(panelId)) {
        return prev
      }
      const newHidden = [...prev, panelId]
      // localStorage에 저장
      try {
        localStorage.setItem('hidden-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 패널 저장 실패:', e)
      }
      return newHidden
    })
  }

  // 패널 다시 표시하기 (편집 버튼에서 사용)
  const handleShowPanel = (panelId) => {
    setHiddenPanels(prev => {
      const newHidden = prev.filter(id => id !== panelId)
      // localStorage에 저장
      try {
        localStorage.setItem('hidden-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 패널 저장 실패:', e)
      }
      return newHidden
    })
  }

  // 숨겨진 패널 목록 가져오기 (편집 버튼에서 사용)
  const getHiddenPanels = () => {
    return hiddenPanels
  }

  // 레이아웃 저장 (localStorage)
  const saveLayout = () => {
    try {
      const layout = {
        panels: {},
        order: {}
      }
      
      // 각 패널의 너비 저장 (최신 값 참조)
      const currentSizes = panelSizesRef.current
      Object.keys(currentSizes).forEach(panelId => {
        layout.panels[panelId] = {
          width: currentSizes[panelId]
        }
      })
      
      // 패널 순서 저장
      if (containerRef.current) {
        const panels = Array.from(containerRef.current.querySelectorAll('.panel:not(.hidden)'))
        layout.order['dashboard-container'] = panels.map(panel => 
          panel.getAttribute('data-panel-id')
        ).filter(id => id)
      }
      
      localStorage.setItem('dashboard-layout', JSON.stringify(layout))
    } catch (e) {
      console.error('레이아웃 저장 실패:', e)
    }
  }

  // SortableJS 초기화
  useEffect(() => {
    const initSortable = () => {
      if (!containerRef.current) return

      // 기존 인스턴스 제거
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
        sortableInstance.current = null
      }

      // SortableJS 인스턴스 생성
      try {
        sortableInstance.current = new Sortable(containerRef.current, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          filter: '.panel-resize-handle, button, .panel-modal-close',
          preventOnFilter: false,
          disabled: isModalOpen, // 모달이 열려있으면 드래그 비활성화
          
          onStart: (evt) => {
            // 모달이 열려있으면 드래그 방지
            if (isModalOpen || document.querySelector('.panel-modal-overlay')) {
              evt.cancel()
              return
            }
            setIsDragging(true)
            evt.item.classList.add('dragging', 'sortable-selected')
          },
          
          onEnd: (evt) => {
            const panel = evt.item
            panel.classList.remove('dragging', 'sortable-selected')
            
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex
            
            if (oldIndex === newIndex) {
              setIsDragging(false)
              return
            }

            // 최신 값 참조
            const currentOrder = panelOrderRef.current

            // 새 순서 생성 (위치만 변경, 너비는 변경하지 않음)
            const newOrder = [...currentOrder]
            const [draggedOrder] = newOrder.splice(oldIndex, 1)
            newOrder.splice(newIndex, 0, draggedOrder)

            // 패널 순서만 업데이트
            setPanelOrder(newOrder)
            
            // 패널 순서 업데이트
            setTimeout(() => {
              updatePanelOrder()
              saveLayout()
            }, 0)
            
            // 드래그 플래그 해제 (클릭 이벤트와 구분하기 위해 지연)
            setTimeout(() => {
              setIsDragging(false)
            }, 100)
          }
        })
      } catch (error) {
        console.error('SortableJS 초기화 실패:', error)
      }
    }

    // DOM이 렌더링될 때까지 대기
    const timer = setTimeout(initSortable, 0)

      return () => {
        clearTimeout(timer)
        if (sortableInstance.current) {
          sortableInstance.current.destroy()
          sortableInstance.current = null
        }
      }
    }, [isModalOpen]) // 모달 상태 변경 시 재초기화

  const handleEdit = () => {
    setIsEditModalOpen(true)
  }

  return (
    <div className="App">
      <TopBar
        breadcrumbItems={['Home', 'Dashboards', 'Sensor Data']}
      />
      
      <DataRangeSelector
        selected={selectedRange}
        onSelect={setSelectedRange}
        onEdit={handleEdit}
      />
      
      <div 
        ref={containerRef}
        className="dashboard-container"
        id="dashboard-container"
      >
        {panelOrder
          .filter(orderIndex => !hiddenPanels.includes(panelConfigs[orderIndex].id))
          .map((orderIndex, index) => {
            const config = panelConfigs[orderIndex]
            return (
              <Panel 
                key={config.id}
                id={config.id}
                index={index}
                title={config.title}
                subtitle={getSubtitle()}
                size={panelSizes[config.id]}
                onSizeChange={handleSizeChange}
                isDragging={isDragging}
                onModalOpen={() => setIsModalOpen(true)}
                onModalClose={() => setIsModalOpen(false)}
                onHide={() => handleHidePanel(config.id)}
              >
                {config.content}
              </Panel>
            )
          })}
      </div>
      
      <EditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        hiddenPanels={hiddenPanels}
        panelConfigs={panelConfigs}
        onShowPanel={handleShowPanel}
      />
    </div>
  )
}

export default App

