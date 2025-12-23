import './PanelModal.css'
import PanelHeader from '../PanelHeader/PanelHeader'

// PanelModal 컴포넌트 - Panel의 내용을 재사용하는 모달 껍데기
const PanelModal = ({ isOpen, onClose, title, subtitle, children }) => {
  if (!isOpen) return null;

  return (
    <div className="panel-modal-overlay" onMouseDown={onClose}>
      <div 
        className="panel-modal" 
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="panel-modal-header-wrapper">
            <PanelHeader
              title={title}
              subtitle={subtitle}
            />
            <button className="panel-modal-close" onClick={onClose}>×</button>
          </div>
        )}
        <div className="panel-modal-content">
          {/* Panel의 children 내용을 여기에 재사용 */}
          {children}
        </div>
      </div>
    </div>
  );
};

export default PanelModal;

