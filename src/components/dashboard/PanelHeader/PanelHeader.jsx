import './PanelHeader.css'
import eyeIcon from '../../../assets/icons/eye_icon.png'

const PanelHeader = ({ title, subtitle, onHide, onCsvClick, showCsv = true }) => {
  const handleHideClick = (e) => {
    e.stopPropagation()
    if (onHide) {
      onHide()
    }
  }

  const handleCsvClick = (e) => {
    e.stopPropagation()
    if (onCsvClick) {
      onCsvClick()
    }
  }

  return (
    <div className="panel-header">
      <div className="panel-header-left">
        <h2 className="panel-title">{title}</h2>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </div>
      <div className="panel-header-right">
        {showCsv && (
        <button 
          className="panel-csv-button"
          onClick={handleCsvClick}
          title="CSV 다운로드"
        >
          <span className="csv-text">CSV</span>
          <svg className="csv-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 10L4 6H6V2H10V6H12L8 10Z" fill="currentColor"/>
            <path d="M2 12V14H14V12H2Z" fill="currentColor"/>
          </svg>
        </button>
        )}
        {onHide && (
          <button 
            className="panel-hide-button"
            onClick={handleHideClick}
            title="패널 숨기기"
          >
            <img src={eyeIcon} alt="숨기기" />
          </button>
        )}
      </div>
    </div>
  )
}

export default PanelHeader

