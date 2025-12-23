import './PanelHeader.css'
import eyeIcon from '../../../assets/icons/eye_icon.png'

const PanelHeader = ({ title, subtitle, onHide }) => {
  const handleHideClick = (e) => {
    e.stopPropagation()
    if (onHide) {
      onHide()
    }
  }

  return (
    <div className="panel-header">
      <div className="panel-header-left">
        <h2 className="panel-title">{title}</h2>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </div>
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
  )
}

export default PanelHeader

