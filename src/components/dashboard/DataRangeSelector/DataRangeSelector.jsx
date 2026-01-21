import './DataRangeSelector.css'

const DataRangeSelector = ({ selected, onSelect, onEdit }) => {
  const ranges = [
    { value: '1h', label: '1시간' },
    { value: '6h', label: '6시간' },
    { value: '24h', label: '24시간' },
    { value: '7d', label: '7일' }
  ]

  return (
    <div className="data-range-selector">
      <span className="data-range-label">데이터 범위:</span>
      <div className="data-range-buttons">
        {ranges.map((range) => (
          <button
            key={range.value}
            className={`data-range-button ${selected === range.value ? 'active' : ''}`}
            onClick={() => onSelect(range.value)}
          >
            {range.label}
          </button>
        ))}
      </div>
      {onEdit && (
        <button className="data-range-edit-button" onClick={onEdit} title="숨겨진 패널 보기">
          More Panels
        </button>
      )}
    </div>
  )
}

export default DataRangeSelector

