import { useMemo, useRef, useEffect, useState } from 'react'
import Sortable from 'sortablejs'
import { Panel, DataRangeSelector } from '../../index'
import MotorForward from '../MotorForward/MotorForward'
import Counter from '../Counter/Counter'
import DieProtection from '../DieProtection/DieProtection'
import MachineStatus from '../MachineStatus/MachineStatus'
import './MainPage.css'

const MainPage = ({ panelSizes, onSizeChange, isDragging, onModalOpen, onModalClose, onHide, hiddenPanels, panelOrder, onPanelOrderChange, selectedRange, onSelectRange, onEdit, onChartClick, machineData, setMachineData }) => {
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
          filter: '.panel-resize-handle, button, .panel-modal-close',
          preventOnFilter: false,
          disabled: false,
          
          onStart: (evt) => {
            if (document.querySelector('.panel-modal-overlay')) {
              evt.cancel()
              return
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
      <DataRangeSelector
        selected={selectedRange}
        onSelect={onSelectRange}
        onEdit={onEdit}
      />
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
              onHide={onHide}
              showCsv={false}
            >
              {config.id === 'main-panel4' && onChartClick ? (
                <MachineStatus 
                  onChartClick={onChartClick}
                  machineData={machineData}
                  setMachineData={setMachineData}
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
