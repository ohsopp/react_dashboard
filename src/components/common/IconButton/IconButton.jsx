import './IconButton.css'

const IconButton = ({ icon, label, onClick, active = false, ...props }) => {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon || label}
    </button>
  )
}

export default IconButton

