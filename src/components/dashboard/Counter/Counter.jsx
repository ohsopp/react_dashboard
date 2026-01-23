import { useState, useEffect, useRef, memo } from 'react'
import './Counter.css'

const Counter = memo(() => {
  // 더미 데이터 - state로 관리하여 주기적으로 변경
  const [batches, setBatches] = useState([
    {
      label: 'Batch 1',
      current: 12450,
      total: 25000,
    },
    {
      label: 'Batch 2',
      current: 8500,
      total: 30000
    },
    {
      label: 'Overall',
      current: 20950,
      total: 55000
    }
  ])
  
  const timeoutRefs = useRef({ batch1: null, batch2: null })
  
  // 각 배치마다 랜덤한 간격(1~3초)으로 1씩 증가
  useEffect(() => {
    const getRandomInterval = () => Math.floor(Math.random() * 2000) + 1000 // 1~3초
    
    const scheduleUpdate = (batchLabel, refKey) => {
      // 기존 타이머가 있으면 클리어
      if (timeoutRefs.current[refKey]) {
        clearTimeout(timeoutRefs.current[refKey])
      }
      
      const interval = getRandomInterval()
      timeoutRefs.current[refKey] = setTimeout(() => {
        setBatches(prev => {
          const updated = prev.map(batch => {
            if (batch.label === batchLabel) {
              let newCurrent = batch.current + 1
              // total을 다 채웠으면 0으로 리셋
              if (newCurrent > batch.total) {
                newCurrent = 0
              }
              return {
                ...batch,
                current: newCurrent
              }
            }
            return batch
          })
          
          // Overall의 current는 Batch 1과 Batch 2의 합으로 계산
          const batch1 = updated.find(b => b.label === 'Batch 1')
          const batch2 = updated.find(b => b.label === 'Batch 2')
          const overall = updated.find(b => b.label === 'Overall')
          
          if (batch1 && batch2 && overall) {
            overall.current = batch1.current + batch2.current
          }
          
          return updated
        })
        
        // 다음 업데이트 스케줄링
        scheduleUpdate(batchLabel, refKey)
      }, interval)
    }
    
    // Batch 1과 Batch 2 각각에 대해 독립적인 타이머 시작
    scheduleUpdate('Batch 1', 'batch1')
    scheduleUpdate('Batch 2', 'batch2')
    
    return () => {
      if (timeoutRefs.current.batch1) {
        clearTimeout(timeoutRefs.current.batch1)
      }
      if (timeoutRefs.current.batch2) {
        clearTimeout(timeoutRefs.current.batch2)
      }
    }
  }, [])
  
  // percentage 계산
  const batchesWithPercentage = batches.map(batch => ({
    ...batch,
    percentage: batch.total > 0 ? Math.round((batch.current / batch.total) * 100) : 0
  }))

  const handleReset = (e, label) => {
    e.stopPropagation()
    // Reset 기능은 나중에 구현 가능
    console.log(`Reset ${label}`)
  }

  return (
    <div className="counter">
      {batchesWithPercentage.map((batch, index) => (
        <div key={index} className="counter-item">
          <div className="counter-header">
            <span className="counter-label">{batch.label}</span>
            <div className="counter-info">
              <button 
                className="counter-reset"
                onClick={(e) => handleReset(e, batch.label)}
              >
                Reset
              </button>
              <span className="counter-count">
                {batch.current.toLocaleString()}/{batch.total.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="counter-progress-container">
            <div className="counter-progress-bar">
              <div 
                className="counter-progress-fill"
                style={{ width: `${batch.percentage}%` }}
              />
            </div>
            <span className="counter-percentage">{batch.percentage}%</span>
          </div>
        </div>
      ))}
    </div>
  )
})

Counter.displayName = 'Counter'

export default Counter
