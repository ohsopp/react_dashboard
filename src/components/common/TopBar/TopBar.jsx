import './TopBar.css'
import Breadcrumb from '../Breadcrumb/Breadcrumb'

const INFLUXDB_URL = 'http://localhost:8090'

const TopBar = ({ breadcrumbItems }) => {
  const handleInfluxDBClick = (e) => {
    e.preventDefault()
    window.open(INFLUXDB_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        {breadcrumbItems && <Breadcrumb items={breadcrumbItems} />}
      </div>
      <div className="topbar-right">
        <a 
          href={INFLUXDB_URL}
          onClick={handleInfluxDBClick}
          className="influxdb-link"
          title="InfluxDB 대시보드 열기"
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="influxdb-icon"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <span><span className="influx-bold">influx</span>db</span>
        </a>
      </div>
    </header>
  );
};

export default TopBar;

