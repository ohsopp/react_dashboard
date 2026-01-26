import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Sortable from 'sortablejs'
import './App.css'
import { Panel, TopBar, DataRangeSelector, EditModal } from './components'
import MainPage from './components/dashboard/MainPage/MainPage'
import ShiftReport from './components/dashboard/ShiftReport/ShiftReport'
import SensorInformation from './components/dashboard/SensorInformation/SensorInformation'
import { useSensorData } from './hooks/useSensorData'
import { usePanelConfigs } from './hooks/usePanelConfigs'

function App() {
  const [activeTab, setActiveTab] = useState('main') // 'main', 'sensor', or 'sensorInfo'
  const [selectedRange, setSelectedRange] = useState('1h')
  
  // Machine #1 공통 데이터 상태
  const [machineData, setMachineData] = useState({
    timer: 0,
    dieNo: 62,
    producedParts: 835,
    strokeRate: 19,
    productionEfficiency: 65, // OEE로 사용
    status: 'PRODUCING',
    dieProtection: true,
    // Shift Report용 계산된 값들
    quality: 72,
    performance: 80,
    availability: 65,
    oee: 65, // productionEfficiency와 동일
    targetParts: 4800,
    actualParts: 4230
  })
  
  // 센서 데이터 훅 사용
  const {
    temperature,
    temperatureHistory,
    vibrationHistory,
    dataZoomRange,
    setDataZoomRange,
    ipInfo,
    networkStatus,
    vibrationTemperatureRef,
    fetchTemperatureHistory
  } = useSensorData(selectedRange)
  
  const getSubtitle = () => {
    const rangeMap = {
      '1h': 'Last 1 hour',
      '6h': 'Last 6 hours',
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days'
    }
    return rangeMap[selectedRange] || 'Last 1 hour'
  }

  // 패널 설정 훅 사용
  const { panelConfigs, statPanelConfigs } = usePanelConfigs({
    temperature,
    temperatureHistory,
    vibrationHistory,
    selectedRange,
    dataZoomRange,
    setDataZoomRange,
    networkStatus
  })

  // 기본 레이아웃: panel1, panel6, panel7 (3등분), panel2, panel5 (2등분), panel8 (전체)
  const DEFAULT_PANEL_SIZES = {
    panel1: 4,  // 3등분 (12/3 = 4)
    panel2: 6,  // 2등분 (12/2 = 6)
    panel5: 6,  // 2등분 (12/2 = 6)
    panel6: 4,  // 3등분 (12/3 = 4)
    panel7: 4,  // 3등분 (12/3 = 4)
    panel8: 6,  // 절반 (12/2 = 6)
    panel12: 4, // 탁도 그래프 (3등분)
    panel13: 4, // 유량 그래프 (3등분)
    panel14: 4  // 초음파 그래프 (3등분)
  }
  
  const [panelSizes, setPanelSizes] = useState(() => {
    // localStorage에서 저장된 레이아웃 불러오기
    try {
      const saved = localStorage.getItem('dashboard-layout')
      if (saved) {
        const layout = JSON.parse(saved)
        if (layout.panels) {
          const sizes = {}
          Object.keys(layout.panels).forEach(panelId => {
            sizes[panelId] = layout.panels[panelId].width
          })
          // 기본값과 병합 (없는 패널은 기본값 사용)
          return { ...DEFAULT_PANEL_SIZES, ...sizes }
        }
      }
    } catch (e) {
      console.error('레이아웃 로드 실패:', e)
    }
    return DEFAULT_PANEL_SIZES
  })
  
  // 통계 패널 전용 사이즈/순서/숨김 관리 (4개를 한 줄에 배치: 12/4 = 3)
  const [statPanelSizes, setStatPanelSizes] = useState({
    'stat-panel6': 3,  // 1/4
    'stat-panel7': 3,  // 1/4
    'stat-panel8': 3,  // 1/4
    'stat-panel9': 3   // 1/4
  })
  
  const [isDragging, setIsDragging] = useState(false)
  const [isStatDragging, setIsStatDragging] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isShiftReportOpen, setIsShiftReportOpen] = useState(false)
  const sortableInstance = useRef(null)
  const statSortableInstance = useRef(null)
  const containerRef = useRef(null)
  const statContainerRef = useRef(null)
  
  // 기본 패널 순서: panel1..panel14 (panel9, panel10, panel11 제거됨)
  // panelConfigs: [panel1(0), panel2(1), panel5(2), panel6(3), panel7(4), panel8(5), panel12(6), panel13(7), panel14(8)]
  const DEFAULT_PANEL_ORDER = [0, 3, 4, 1, 2, 5, 6, 7, 8]
  
  const [panelOrder, setPanelOrder] = useState(() => {
    // localStorage에서 저장된 순서 불러오기
    try {
      const saved = localStorage.getItem('dashboard-layout')
      if (saved) {
        const layout = JSON.parse(saved)
        if (layout.order && layout.order['dashboard-container']) {
          // 저장된 패널 ID를 인덱스로 변환
          const savedOrder = layout.order['dashboard-container']
          const orderMap = {
            'panel1': 0,
            'panel2': 1,
            'panel5': 2,
            'panel6': 3,
            'panel7': 4,
            'panel8': 5,
            'panel12': 6,
            'panel13': 7,
            'panel14': 8
          }
          const convertedOrder = savedOrder
            .map(id => orderMap[id])
            .filter(index => index !== undefined)
          
          // 기본 순서와 병합 (없는 패널은 기본 순서 사용)
          if (convertedOrder.length > 0) {
            const allPanels = [0, 1, 2, 3, 4, 5, 6, 7, 8] // 모든 패널 인덱스
            const missing = allPanels.filter(idx => !convertedOrder.includes(idx))
            return [...convertedOrder, ...missing]
          }
        }
      }
    } catch (e) {
      console.error('패널 순서 로드 실패:', e)
    }
    return DEFAULT_PANEL_ORDER
  })
  
  const [statPanelOrder, setStatPanelOrder] = useState(() => {
    return [0, 1, 2, 3]
  })
  
  const panelOrderRef = useRef([0, 3, 4, 1, 2, 5, 6, 7, 8])
  const statPanelOrderRef = useRef([0, 1, 2, 3])
  const panelSizesRef = useRef({
    panel1: 4,
    panel2: 6,
    panel5: 6,
    panel6: 4,
    panel7: 4,
    panel8: 12,
    panel12: 4,
    panel13: 4,
    panel14: 4
  })
  
  // Main 패널 사이즈 관리
  const [mainPanelSizes, setMainPanelSizes] = useState({
    'main-panel1': 4,
    'main-panel2': 4,
    'main-panel3': 4,
    'main-panel4': 4
  })
  
  // Main 패널 순서 관리
  // 기본 순서: Machine #1(3) 왼쪽, Motor Forward(0) 가운데, Die Protection(1)과 Counter(2) 오른쪽
  const [mainPanelOrder, setMainPanelOrder] = useState(() => {
    // localStorage에서 저장된 순서 불러오기
    try {
      const saved = localStorage.getItem('main-panel-order')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('메인 패널 순서 로드 실패:', e)
    }
    // 기본 순서: [Machine #1, Motor Forward, Die Protection, Counter]
    return [3, 0, 1, 2]
  })
  const statPanelSizesRef = useRef({
    'stat-panel6': 3,
    'stat-panel7': 3,
    'stat-panel8': 3,
    'stat-panel9': 3
  })
  
  // panelOrder가 변경될 때 panelOrderRef 업데이트
  useEffect(() => {
    panelOrderRef.current = panelOrder
  }, [panelOrder])
  
  // panelSizes가 변경될 때 panelSizesRef 업데이트
  useEffect(() => {
    panelSizesRef.current = panelSizes
  }, [panelSizes])
  
  
  const [hiddenPanels, setHiddenPanels] = useState(() => {
    // localStorage에서 숨겨진 패널 로드
    try {
      const saved = localStorage.getItem('hidden-panels')
      if (saved) {
        const parsed = JSON.parse(saved)
        // panel8이 없으면 기본적으로 숨김 처리 (센서 정보는 사이드바로 이동)
        if (!parsed.includes('panel8')) {
          parsed.push('panel8')
        }
        return parsed
      }
    } catch (e) {
      console.error('숨겨진 패널 로드 실패:', e)
    }
    // 기본값: panel8은 사이드바로 이동했으므로 숨김
    return ['panel8']
  })
  
  const [hiddenStatPanels, setHiddenStatPanels] = useState(() => {
    // localStorage에서 숨겨진 통계 패널 로드
    try {
      const saved = localStorage.getItem('hidden-stat-panels')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('숨겨진 통계 패널 로드 실패:', e)
    }
    return []
  })
  
  const [hiddenMainPanels, setHiddenMainPanels] = useState(() => {
    // localStorage에서 숨겨진 Main 패널 로드
    try {
      const saved = localStorage.getItem('hidden-main-panels')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('숨겨진 Main 패널 로드 실패:', e)
    }
    return []
  })
  
  const handleMainSizeChange = (panelId, newSize) => {
    setMainPanelSizes(prev => ({
      ...prev,
      [panelId]: newSize
    }))
  }
  
  const handleHideMainPanel = (panelId) => {
    setHiddenMainPanels(prev => {
      if (prev.includes(panelId)) {
        return prev
      }
      const newHidden = [...prev, panelId]
      try {
        localStorage.setItem('hidden-main-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 Main 패널 저장 실패:', e)
      }
      return newHidden
    })
  }
  
  const handleShowMainPanel = (panelId) => {
    setHiddenMainPanels(prev => {
      const newHidden = prev.filter(id => id !== panelId)
      try {
        localStorage.setItem('hidden-main-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 Main 패널 저장 실패:', e)
      }
      return newHidden
    })
  }

  // ref 업데이트
  useEffect(() => {
    panelOrderRef.current = panelOrder
  }, [panelOrder])

  useEffect(() => {
    panelSizesRef.current = panelSizes
  }, [panelSizes])
  
  useEffect(() => {
    statPanelOrderRef.current = statPanelOrder
  }, [statPanelOrder])
  
  useEffect(() => {
    statPanelSizesRef.current = statPanelSizes
  }, [statPanelSizes])
  
  // statPanelConfigs의 길이가 변경되면 statPanelOrderRef 업데이트
  const statPanelConfigsLength = statPanelConfigs.length
  useEffect(() => {
    const newOrder = statPanelConfigs.map((_, index) => index)
    if (statPanelOrder.length !== newOrder.length) {
      statPanelOrderRef.current = newOrder
      setStatPanelOrder(newOrder)
    } else {
      statPanelOrderRef.current = newOrder
    }
  }, [statPanelConfigsLength])

  const handleSizeChange = (panelId, newSize) => {
    setPanelSizes(prev => ({
      ...prev,
      [panelId]: newSize
    }))
    // 레이아웃 저장
    setTimeout(() => saveLayout(), 0)
  }
  
  const handleStatSizeChange = (panelId, newSize) => {
    setStatPanelSizes(prev => ({
      ...prev,
      [panelId]: newSize
    }))
    // 레이아웃 저장
    setTimeout(() => saveStatLayout(), 0)
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
  
  // 통계 패널 숨기기
  const handleHideStatPanel = (panelId) => {
    setHiddenStatPanels(prev => {
      if (prev.includes(panelId)) {
        return prev
      }
      const newHidden = [...prev, panelId]
      try {
        localStorage.setItem('hidden-stat-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 통계 패널 저장 실패:', e)
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
  
  // 통계 패널 다시 표시하기
  const handleShowStatPanel = (panelId) => {
    setHiddenStatPanels(prev => {
      const newHidden = prev.filter(id => id !== panelId)
      try {
        localStorage.setItem('hidden-stat-panels', JSON.stringify(newHidden))
      } catch (e) {
        console.error('숨겨진 통계 패널 저장 실패:', e)
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
  
  // 통계 패널 레이아웃 저장
  const saveStatLayout = () => {
    try {
      const layout = {
        panels: {},
        order: {}
      }
      
      const currentSizes = statPanelSizesRef.current
      Object.keys(currentSizes).forEach(panelId => {
        layout.panels[panelId] = {
          width: currentSizes[panelId]
        }
      })
      
      if (statContainerRef.current) {
        const panels = Array.from(statContainerRef.current.querySelectorAll('.panel:not(.hidden)'))
        layout.order['stats-container'] = panels.map(panel => 
          panel.getAttribute('data-panel-id')
        ).filter(id => id)
      }
      
      localStorage.setItem('stat-dashboard-layout', JSON.stringify(layout))
    } catch (e) {
      console.error('통계 패널 레이아웃 저장 실패:', e)
    }
  }

  // SortableJS 초기화
  useEffect(() => {
    // Sensor 탭이 아닐 때는 초기화하지 않음
    if (activeTab !== 'sensor') {
      // 기존 인스턴스 제거
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
        sortableInstance.current = null
      }
      return
    }

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
    const timer = setTimeout(initSortable, 100)

      return () => {
        clearTimeout(timer)
        if (sortableInstance.current) {
          sortableInstance.current.destroy()
          sortableInstance.current = null
        }
      }
    }, [isModalOpen, activeTab]) // 모달 상태 및 탭 변경 시 재초기화

  // 통계 패널용 SortableJS 초기화
  useEffect(() => {
    // Sensor 탭이 아닐 때는 초기화하지 않음
    if (activeTab !== 'sensor') {
      // 기존 인스턴스 제거
      if (statSortableInstance.current) {
        statSortableInstance.current.destroy()
        statSortableInstance.current = null
      }
      return
    }

    const initStatSortable = () => {
      if (!statContainerRef.current) return

      // 기존 인스턴스 제거
      if (statSortableInstance.current) {
        statSortableInstance.current.destroy()
        statSortableInstance.current = null
      }

      // SortableJS 인스턴스 생성
      try {
        statSortableInstance.current = new Sortable(statContainerRef.current, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          filter: '.panel-resize-handle, button, .panel-modal-close',
          preventOnFilter: false,
          disabled: isModalOpen,
          
          onStart: (evt) => {
            if (isModalOpen || document.querySelector('.panel-modal-overlay')) {
              evt.cancel()
              return
            }
            setIsStatDragging(true)
            evt.item.classList.add('dragging', 'sortable-selected')
          },
          
          onEnd: (evt) => {
            const panel = evt.item
            panel.classList.remove('dragging', 'sortable-selected')
            
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex
            
            if (oldIndex === newIndex) {
              setIsStatDragging(false)
              return
            }

            const currentOrder = statPanelOrderRef.current
            const newOrder = [...currentOrder]
            const [draggedOrder] = newOrder.splice(oldIndex, 1)
            newOrder.splice(newIndex, 0, draggedOrder)

            setStatPanelOrder(newOrder)
            
            setTimeout(() => {
              updateStatPanelOrder()
              saveStatLayout()
            }, 0)
            
            setTimeout(() => {
              setIsStatDragging(false)
            }, 100)
          }
        })
      } catch (error) {
        console.error('통계 패널 SortableJS 초기화 실패:', error)
      }
    }

    const timer = setTimeout(initStatSortable, 100)

    return () => {
      clearTimeout(timer)
      if (statSortableInstance.current) {
        statSortableInstance.current.destroy()
        statSortableInstance.current = null
      }
    }
  }, [isModalOpen, activeTab])

  // 통계 패널 순서 업데이트
  const updateStatPanelOrder = () => {
    if (!statContainerRef.current) return
    
    const panels = Array.from(statContainerRef.current.querySelectorAll('.panel:not(.hidden)'))
    const newOrder = panels.map(panel => {
      const panelId = panel.getAttribute('data-panel-id')
      const index = statPanelConfigs.findIndex(config => config.id === panelId)
      return index !== -1 ? index : null
    }).filter(index => index !== null)
    
    setStatPanelOrder(newOrder)
  }

  const handleEdit = () => {
    setIsEditModalOpen(true)
  }

  return (
    <div className="App">
      <TopBar
        timeRange={selectedRange}
        onRefresh={() => fetchTemperatureHistory(selectedRange)}
        breadcrumbItems={['Home', 'Dashboards', 'Sensor Data']}
      />
      
      <div className="app-content-wrapper">
        <div className="app-sidebar">
          <div 
            className={`sidebar-tab ${activeTab === 'main' ? 'active' : ''}`}
            onClick={() => setActiveTab('main')}
            title="Main Page"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div 
            className={`sidebar-tab ${activeTab === 'sensor' ? 'active' : ''}`}
            onClick={() => setActiveTab('sensor')}
            title="Sensor"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"></path>
              <path d="M18 7l-5 5-4-4-3 3"></path>
            </svg>
          </div>
          <div 
            className={`sidebar-tab ${activeTab === 'sensorInfo' ? 'active' : ''}`}
            onClick={() => setActiveTab('sensorInfo')}
            title="Sensor Information"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4"></path>
              <path d="M12 8h.01"></path>
            </svg>
          </div>
        </div>
        <div className="app-main">
          {activeTab === 'main' ? (
            <MainPage
              panelSizes={mainPanelSizes}
              onSizeChange={handleMainSizeChange}
              isDragging={isDragging}
              onModalOpen={() => setIsModalOpen(true)}
              onModalClose={() => setIsModalOpen(false)}
              onHide={handleHideMainPanel}
              hiddenPanels={hiddenMainPanels}
              panelOrder={mainPanelOrder}
              onPanelOrderChange={setMainPanelOrder}
              selectedRange={selectedRange}
              onSelectRange={setSelectedRange}
              onEdit={handleEdit}
              onChartClick={() => setIsShiftReportOpen(true)}
              machineData={machineData}
              setMachineData={setMachineData}
            />
          ) : activeTab === 'sensorInfo' ? (
            <SensorInformation />
          ) : (
            <>
              <DataRangeSelector
                selected={selectedRange}
                onSelect={setSelectedRange}
                onEdit={handleEdit}
              />
              
              {/* 통계 패널 그리드 (상단 작은 카드) */}
              <div 
                ref={statContainerRef}
                className="stats-container"
                id="stats-container"
              >
            {statPanelOrder
              .filter(orderIndex => statPanelConfigs[orderIndex] && !hiddenStatPanels.includes(statPanelConfigs[orderIndex].id))
              .map((orderIndex, index) => {
                const config = statPanelConfigs[orderIndex]
                if (!config) return null
                return (
                  <Panel 
                    key={config.id}
                    id={config.id}
                    index={index}
                    title={config.title}
                    subtitle={null}
                    size={statPanelSizes[config.id]}
                    onSizeChange={handleStatSizeChange}
                    isDragging={isStatDragging}
                    onModalOpen={() => setIsModalOpen(true)}
                    onModalClose={() => setIsModalOpen(false)}
                    onHide={() => handleHideStatPanel(config.id)}
                    showCsv={false}
                  >
                    {config.content}
                  </Panel>
                )
              })}
              </div>
              
              {/* 메인 패널 그리드 */}
              <div 
                ref={containerRef}
                className="dashboard-container"
                id="dashboard-container"
              >
            {panelOrder
              .filter(orderIndex => panelConfigs[orderIndex] && !hiddenPanels.includes(panelConfigs[orderIndex].id))
              .map((orderIndex, index) => {
                const config = panelConfigs[orderIndex]
                if (!config) return null
                
                // Vibration Sensor 패널의 경우에만 최신 온도값 계산 (이전값 유지)
                let temperatureValue = null
                if (config.id === 'panel7') {
                  temperatureValue = vibrationTemperatureRef.current // 기본값은 이전값
                  if (vibrationHistory.temperature && vibrationHistory.temperature.length > 0) {
                    // 배열에서 유효한 최신값 찾기 (뒤에서부터)
                    for (let i = vibrationHistory.temperature.length - 1; i >= 0; i--) {
                      const temp = vibrationHistory.temperature[i]
                      if (temp !== null && temp !== undefined && !isNaN(temp)) {
                        temperatureValue = temp
                        vibrationTemperatureRef.current = temp // ref 업데이트
                        break
                      }
                    }
                  }
                }
                
                return (
                  <Panel 
                    key={config.id}
                    id={config.id}
                    index={index}
                    title={config.title}
                    subtitle={null}
                    size={panelSizes[config.id]}
                    onSizeChange={handleSizeChange}
                    isDragging={isDragging}
                    onModalOpen={() => setIsModalOpen(true)}
                    onModalClose={() => setIsModalOpen(false)}
                    onHide={() => handleHidePanel(config.id)}
                    temperature={config.id === 'panel7' ? temperatureValue : null}
                  >
                    {config.content}
                  </Panel>
                )
              })}
              </div>
            </>
          )}
          
          <EditModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            hiddenPanels={[...hiddenPanels, ...hiddenStatPanels, ...hiddenMainPanels]}
            panelConfigs={[...panelConfigs, ...statPanelConfigs]}
            onShowPanel={(panelId) => {
              // 통계 패널인지 확인
              if (panelId.startsWith('stat-panel')) {
                handleShowStatPanel(panelId)
              } else if (panelId.startsWith('main-panel')) {
                handleShowMainPanel(panelId)
              } else {
                handleShowPanel(panelId)
              }
            }}
          />
          
          {/* Shift Report 모달 */}
          {isShiftReportOpen && (
            <div className="panel-modal-overlay" onMouseDown={() => setIsShiftReportOpen(false)}>
              <div 
                className="panel-modal" 
                onMouseDown={(e) => e.stopPropagation()}
                style={{ width: '95vw', height: '95vh', maxWidth: '95vw', maxHeight: '95vh' }}
              >
                <div className="panel-modal-header-wrapper">
                  <div className="panel-header">
                    <div className="panel-header-left">
                      <h2 className="panel-title">Shift Report</h2>
                    </div>
                    <div className="panel-header-right">
                      <button 
                        className="panel-modal-close" 
                        onClick={() => setIsShiftReportOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
                <div className="panel-modal-content" style={{ padding: '0', overflow: 'auto' }}>
                  <ShiftReport machineData={machineData} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

