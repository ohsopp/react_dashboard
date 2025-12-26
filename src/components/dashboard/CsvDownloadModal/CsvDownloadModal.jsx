import { useState, useEffect } from 'react'
import './CsvDownloadModal.css'

const CsvDownloadModal = ({ isOpen, onClose, panelId }) => {
  const [selectedQuickRange, setSelectedQuickRange] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  // 모달이 열릴 때 현재 시간으로 초기화
  useEffect(() => {
    if (isOpen) {
      const now = new Date()
      const end = new Date(now)
      const start = new Date(now.getTime() - 60 * 60 * 1000) // 1시간 전

      // 날짜 포맷: YYYY-MM-DD
      const formatDate = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      // 시간 포맷: HH:MM
      const formatTime = (date) => {
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${hours}:${minutes}`
      }

      setEndDate(formatDate(end))
      setEndTime(formatTime(end))
      setStartDate(formatDate(start))
      setStartTime(formatTime(start))
      setSelectedQuickRange(null)
    }
  }, [isOpen])

  // 빠른 선택 버튼 클릭 핸들러
  const handleQuickSelect = (hours) => {
    setSelectedQuickRange(hours)
    const now = new Date()
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000)

    const formatDate = (date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const formatTime = (date) => {
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${hours}:${minutes}`
    }

    setStartDate(formatDate(start))
    setStartTime(formatTime(start))
    setEndDate(formatDate(now))
    setEndTime(formatTime(now))
  }

  // 선택된 범위 텍스트 생성
  const getSelectedRangeText = () => {
    if (!startDate || !startTime || !endDate || !endTime) {
      return '시간을 선택해주세요'
    }

    try {
      // KST 시간으로 파싱 (로컬 시간으로 처리)
      const start = new Date(`${startDate}T${startTime}`)
      const end = new Date(`${endDate}T${endTime}`)

      const formatDateTime = (date) => {
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const day = date.getDate()
        const hours = date.getHours()
        const minutes = date.getMinutes()
        const ampm = hours >= 12 ? '오후' : '오전'
        const displayHours = hours % 12 || 12
        const displayMinutes = String(minutes).padStart(2, '0')
        return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}시 ${displayMinutes}분`
      }

      return `${formatDateTime(start)} ~ ${formatDateTime(end)}`
    } catch (error) {
      return '시간을 선택해주세요'
    }
  }

  // CSV 다운로드 핸들러
  const handleDownload = async () => {
    if (!startDate || !startTime || !endDate || !endTime) {
      alert('시작 시간과 종료 시간을 모두 선택해주세요.')
      return
    }

    try {
      const start = new Date(`${startDate}T${startTime}`)
      const end = new Date(`${endDate}T${endTime}`)

      if (start >= end) {
        alert('시작 시간은 종료 시간보다 이전이어야 합니다.')
        return
      }

      setIsDownloading(true)

      // KST 시간을 "YYYY-MM-DD HH:MM:SS" 형식으로 변환
      const formatDateTime = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
      }
      
      const startTimeKST = formatDateTime(start)
      const endTimeKST = formatDateTime(end)
      
      console.log('CSV 다운로드 요청:', {
        startTimeKST,
        endTimeKST
      })
      
      // 백엔드 API 호출 (KST 시간 문자열로 전송)
      const response = await fetch(
        `http://localhost:5005/api/export/temperature/csv?start_time_kst=${encodeURIComponent(startTimeKST)}&end_time_kst=${encodeURIComponent(endTimeKST)}`
      )

      if (!response.ok) {
        throw new Error('CSV 다운로드 실패')
      }

      // Blob으로 변환하여 다운로드
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `temperature_${startDate}_${startTime.replace(':', '')}_to_${endDate}_${endTime.replace(':', '')}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setIsDownloading(false)
      onClose()
    } catch (error) {
      console.error('CSV 다운로드 오류:', error)
      alert('CSV 다운로드 중 오류가 발생했습니다.')
      setIsDownloading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="csv-modal-overlay" onMouseDown={onClose}>
      <div 
        className="csv-modal" 
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="csv-modal-header">
          <h2 className="csv-modal-title">CSV 다운로드 기간 선택</h2>
          <button className="csv-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="csv-modal-content">
          <p className="csv-modal-instruction">다운로드할 데이터의 기간을 선택하세요</p>
          
          {/* 빠른 선택 */}
          <div className="csv-quick-select">
            <label className="csv-section-label">빠른 선택:</label>
            <div className="csv-quick-buttons">
              <button 
                className={`csv-quick-button ${selectedQuickRange === 1 ? 'active' : ''}`}
                onClick={() => handleQuickSelect(1)}
              >
                최근 1시간
              </button>
              <button 
                className={`csv-quick-button ${selectedQuickRange === 3 ? 'active' : ''}`}
                onClick={() => handleQuickSelect(3)}
              >
                최근 3시간
              </button>
              <button 
                className={`csv-quick-button ${selectedQuickRange === 6 ? 'active' : ''}`}
                onClick={() => handleQuickSelect(6)}
              >
                최근 6시간
              </button>
              <button 
                className={`csv-quick-button ${selectedQuickRange === 12 ? 'active' : ''}`}
                onClick={() => handleQuickSelect(12)}
              >
                최근 12시간
              </button>
              <button 
                className={`csv-quick-button ${selectedQuickRange === 24 ? 'active' : ''}`}
                onClick={() => handleQuickSelect(24)}
              >
                최근 24시간
              </button>
              <button 
                className={`csv-quick-button ${selectedQuickRange === 168 ? 'active' : ''}`}
                onClick={() => handleQuickSelect(168)}
              >
                최근 7일
              </button>
            </div>
          </div>

          {/* 시작 시간 */}
          <div className="csv-time-section">
            <label className="csv-section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4V8L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              시작 시간 (KST)
            </label>
            <div className="csv-time-inputs">
              <div className="csv-input-group">
                <label>날짜</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setSelectedQuickRange(null)
                  }}
                  className="csv-date-input"
                />
              </div>
              <div className="csv-input-group">
                <label>시간</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value)
                    setSelectedQuickRange(null)
                  }}
                  className="csv-time-input"
                />
              </div>
            </div>
          </div>

          {/* 구분선 */}
          <div className="csv-separator">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* 종료 시간 */}
          <div className="csv-time-section">
            <label className="csv-section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 4V8L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              종료 시간 (KST)
            </label>
            <div className="csv-time-inputs">
              <div className="csv-input-group">
                <label>날짜</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setSelectedQuickRange(null)
                  }}
                  className="csv-date-input"
                />
              </div>
              <div className="csv-input-group">
                <label>시간</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value)
                    setSelectedQuickRange(null)
                  }}
                  className="csv-time-input"
                />
              </div>
            </div>
          </div>

          {/* 선택된 범위 표시 */}
          <div className="csv-selected-range">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 2H14V14H2V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 2V14" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 5H14" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>선택된 범위: {getSelectedRangeText()}</span>
          </div>
        </div>

        <div className="csv-modal-footer">
          <button className="csv-button csv-button-cancel" onClick={onClose}>
            취소
          </button>
          <button 
            className="csv-button csv-button-download" 
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? '다운로드 중...' : '다운로드'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CsvDownloadModal

