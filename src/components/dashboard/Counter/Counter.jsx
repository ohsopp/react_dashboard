import { memo } from 'react'
import './Counter.css'

const Counter = memo(() => {
  // 더미 데이터
  const batches = [
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
  ]
  
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
