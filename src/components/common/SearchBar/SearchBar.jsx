import './SearchBar.css'

const SearchBar = ({ placeholder = "Q Search or jump to...", value, onChange }) => {
  return (
    <div className="search-bar">
      <input
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

export default SearchBar

