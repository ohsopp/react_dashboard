import './Breadcrumb.css'

const Breadcrumb = ({ items }) => {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index} className="breadcrumb-item">
          {index > 0 && <span className="breadcrumb-separator"> &gt; </span>}
          <span className={index === items.length - 1 ? 'breadcrumb-current' : ''}>
            {item}
          </span>
        </span>
      ))}
    </nav>
  )
}

export default Breadcrumb

