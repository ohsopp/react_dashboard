import { useMemo, useRef, useEffect, useState } from 'react'
import Sortable from 'sortablejs'
import { Panel } from '../../index'
import MotorForward from '../MotorForward/MotorForward'
import Counter from '../Counter/Counter'
import DieProtection from '../DieProtection/DieProtection'
import MachineStatus from '../MachineStatus/MachineStatus'
import ModelViewer from '../ModelViewer/ModelViewer'
import './MainPage.css'

const MainPage = ({ panelSizes, onSizeChange, isDragging, onModalOpen, onModalClose, onHide, hiddenPanels, panelOrder, onPanelOrderChange, selectedRange, onSelectRange, onEdit, onChartClick, machineData, setMachineData, machineData2, setMachineData2, machineData3, setMachineData3 }) => {
  const containerRef = useRef(null)
  const sortableInstance = useRef(null)
  const [isMainDragging, setIsMainDragging] = useState(false)

  const mainPanelConfigs = useMemo(() => [
    {
      id: 'main-panel1',
      title: 'Motor Forward',
      content: <MotorForward />
    },
    {
      id: 'main-panel2',
      title: 'Die Protection',
      content: <DieProtection />
    },
    {
      id: 'main-panel3',
      title: 'Counter',
      content: <Counter />
    },
    {
      id: 'main-panel4',
      title: 'Machine #1',
      content: <MachineStatus />
    },
    {
      id: 'main-panel5',
      title: 'Machine #2',
      content: <MachineStatus />
    },
    {
      id: 'main-panel6',
      title: 'Machine #3',
      content: <MachineStatus />
    },
    {
      id: 'main-panel7',
      title: '3D Press Viewer',
      content: <ModelViewer 
        modelPath="/models/Power_Press_Machine_texture.draco.glb" 
        useGltf={true} 
        useDraco={true} 
        instanceKey="panel" 
        enableZoom={false}
        hotspots={[
          {
            number: 1,
            position: [0, -0.5, 0],
            info: '이 부분은 프레스 머신의 접촉부입니다. 금형(펀치와 다이)이 맞물리는 위치입니다.'
          },
          {
            number: 2,
            position: [0.0, 0.95, 0.0],
            info: '이 부분은 프레스 머신의 상단부입니다. 주요 작동 메커니즘이 위치합니다.'
          },
          {
            number: 3,
            position: [-0.95, 0.0, 0.0],
            info: '측면 부품입니다. 모터와 전원 연결부가 위치합니다.'
          },
          {
            number: 4,
            position: [0.95, 0.0, 0.0],
            info: '반대편 측면 부품입니다. 냉각 시스템과 배기 장치가 있습니다.'
          }
        ]}
      />
    }
  ], [])

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
          filter: '.panel-resize-handle, button, .panel-modal-close, canvas',
          preventOnFilter: false,
          disabled: false,
          
          onStart: (evt) => {
            if (document.querySelector('.panel-modal-overlay')) {
              // 모달이 열려있으면 드래그 방지
              if (sortableInstance.current) {
                sortableInstance.current.option('disabled', true)
                setTimeout(() => {
                  if (sortableInstance.current) {
                    sortableInstance.current.option('disabled', false)
                  }
                }, 100)
              }
              return
            }
            // 3D Model Viewer의 Canvas 영역에서 드래그 시작 시 SortableJS 드래그 취소
            // 패널 헤더나 다른 부분에서는 드래그 가능
            const isCanvas = evt.target.tagName === 'CANVAS' || evt.target.closest('canvas')
            const isModelViewerContainer = evt.target.closest('.model-viewer-container')
            
            if (isCanvas || isModelViewerContainer) {
              // Canvas 영역에서는 SortableJS 드래그 취소 (3D 뷰어 드래그는 OrbitControls가 처리)
              if (sortableInstance.current) {
                sortableInstance.current.option('disabled', true)
                // 드래그 종료 후 다시 활성화
                setTimeout(() => {
                  if (sortableInstance.current) {
                    sortableInstance.current.option('disabled', false)
                  }
                }, 100)
              }
              return // 드래그 시작하지 않음
            }
            setIsMainDragging(true)
            evt.item.classList.add('dragging', 'sortable-selected')
          },
          
          onEnd: (evt) => {
            const panel = evt.item
            panel.classList.remove('dragging', 'sortable-selected')
            
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex
            
            if (oldIndex === newIndex) {
              setIsMainDragging(false)
              return
            }

            // 새 순서 생성
            const newOrder = [...panelOrder]
            const [draggedOrder] = newOrder.splice(oldIndex, 1)
            newOrder.splice(newIndex, 0, draggedOrder)

            // 패널 순서 업데이트
            if (onPanelOrderChange) {
              onPanelOrderChange(newOrder)
              // localStorage에 저장
              try {
                localStorage.setItem('main-panel-order', JSON.stringify(newOrder))
              } catch (e) {
                console.error('메인 패널 순서 저장 실패:', e)
              }
            }
            
            // 드래그 플래그 해제
            setTimeout(() => {
              setIsMainDragging(false)
            }, 100)
          }
        })
      } catch (error) {
        console.error('MainPage SortableJS 초기화 실패:', error)
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
  }, [panelOrder, onPanelOrderChange])

  // 패널 순서에 따라 렌더링
  const orderedConfigs = useMemo(() => {
    return panelOrder.map(index => mainPanelConfigs[index]).filter(Boolean)
  }, [panelOrder, mainPanelConfigs])

  return (
    <>
      <div className="main-page-container" ref={containerRef}>
        {orderedConfigs
          .filter(config => !hiddenPanels.includes(config.id))
          .map((config, index) => (
            <Panel
              key={config.id}
              id={config.id}
              index={index}
              title={config.title}
              subtitle={null}
              size={panelSizes[config.id] || 4}
              onSizeChange={onSizeChange}
              isDragging={isMainDragging}
              onModalOpen={onModalOpen}
              onModalClose={onModalClose}
              onHide={null}
              showCsv={false}
            >
              {config.id === 'main-panel4' && onChartClick ? (
                <MachineStatus 
                  onChartClick={onChartClick}
                  machineData={machineData}
                  setMachineData={setMachineData}
                />
              ) : config.id === 'main-panel5' && onChartClick ? (
                <MachineStatus 
                  onChartClick={onChartClick}
                  machineData={machineData2}
                  setMachineData={setMachineData2}
                />
              ) : config.id === 'main-panel6' && onChartClick ? (
                <MachineStatus 
                  onChartClick={onChartClick}
                  machineData={machineData3}
                  setMachineData={setMachineData3}
                />
              ) : (
                config.content
              )}
            </Panel>
          ))}
      </div>
    </>
  )
}

export default MainPage
