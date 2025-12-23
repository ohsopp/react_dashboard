import './EditModal.css'

const EditModal = ({ isOpen, onClose, hiddenPanels, panelConfigs, onShowPanel }) => {
  if (!isOpen) return null

  const handlePanelClick = (panelId) => {
    if (onShowPanel) {
      onShowPanel(panelId)
    }
    // 모달을 닫지 않아서 여러 패널을 연속으로 선택할 수 있도록 함
  }

  return (
    <div className="edit-modal-overlay" onMouseDown={onClose}>
      <div 
        className="edit-modal" 
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="edit-modal-header">
          <h2 className="edit-modal-title">숨겨진 패널</h2>
          <button className="edit-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="edit-modal-content">
          {hiddenPanels.length === 0 ? (
            <div className="edit-modal-empty">
              <p>숨겨진 패널이 없습니다.</p>
            </div>
          ) : (
            <div className="edit-modal-panels">
              {hiddenPanels.map(panelId => {
                const config = panelConfigs.find(c => c.id === panelId)
                if (!config) return null
                
                return (
                  <div
                    key={panelId}
                    className="edit-modal-panel-item"
                    onClick={() => handlePanelClick(panelId)}
                  >
                    <div className="edit-panel-header-wrapper">
                      <div className="edit-panel-header-left">
                        <h3 className="edit-panel-title">{config.title}</h3>
                        <span className="edit-panel-subtitle">클릭하여 다시 표시</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditModal

