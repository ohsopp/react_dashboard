import './TopBar.css'
import Breadcrumb from '../Breadcrumb/Breadcrumb'
import uitLogo from '../../../assets/icons/uit_logo.png'

const INFLUXDB_URL = 'http://localhost:8090'

const TopBar = ({ breadcrumbItems, timeRange, onRefresh }) => {
  const handleInfluxDBClick = (e) => {
    e.preventDefault()
    window.open(INFLUXDB_URL, '_blank', 'noopener,noreferrer')
  }

  const formatTimeRange = () => {
    if (!timeRange) return ''
    // 현재 시간을 KST로 변환 (UTC + 9시간)
    const now = new Date()
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    
    const rangeMap = {
      '1h': 1,
      '6h': 6,
      '24h': 24,
      '7d': 7 * 24
    }
    const hours = rangeMap[timeRange] || 1
    const start = new Date(kstNow.getTime() - hours * 60 * 60 * 1000)
    
    // 한국 표기법: YYYY년 MM월 DD일 HH:MM:SS
    const formatDate = (date) => {
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const day = String(date.getUTCDate()).padStart(2, '0')
      const hours = String(date.getUTCHours()).padStart(2, '0')
      const minutes = String(date.getUTCMinutes()).padStart(2, '0')
      const seconds = String(date.getUTCSeconds()).padStart(2, '0')
      return `${year}년 ${month}월 ${day}일 ${hours}:${minutes}:${seconds}`
    }
    
    return `${formatDate(start)} ~ ${formatDate(kstNow)}`
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-logo">
          <img src={uitLogo} alt="UIT Logo" style={{ height: '20px', width: 'auto' }} />
        </div>
        {breadcrumbItems && <Breadcrumb items={breadcrumbItems} />}
      </div>
      <div className="topbar-right">
        {timeRange && (
          <div className="topbar-time-range">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="time-range-text">{formatTimeRange()}</span>
            <span className="kst-badge">KST</span>
          </div>
        )}
        {onRefresh && (
          <button className="topbar-refresh" onClick={onRefresh} title="새로고침">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        )}
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

