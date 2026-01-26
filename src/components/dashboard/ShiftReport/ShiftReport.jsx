import { memo, useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import './ShiftReport.css'

const ShiftReport = memo(({ machineData }) => {
  // 현재 날짜/시간 상태
  const [currentDate, setCurrentDate] = useState(new Date())
  // Article 확장 상태 관리
  const [expandedArticles, setExpandedArticles] = useState({ 0: true })
  
  // 날짜/시간 업데이트 (1초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDate(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // 시프트 시간 계산 (현재 시간 기준)
  const getShiftInfo = () => {
    const now = currentDate
    const hours = now.getHours()
    const minutes = now.getMinutes()
    
    // Night Shift: 10:00 PM - 6:00 AM
    let shiftType = 'Night Shift'
    let shiftStart = new Date(now)
    let shiftEnd = new Date(now)
    
    if (hours >= 22 || hours < 6) {
      // Night Shift
      shiftStart.setHours(22, 0, 0, 0)
      if (hours < 6) {
        shiftStart.setDate(shiftStart.getDate() - 1)
      }
      shiftEnd.setHours(6, 0, 0, 0)
      if (hours >= 22) {
        shiftEnd.setDate(shiftEnd.getDate() + 1)
      }
    } else if (hours >= 6 && hours < 14) {
      // Day Shift
      shiftType = 'Day Shift'
      shiftStart.setHours(6, 0, 0, 0)
      shiftEnd.setHours(14, 0, 0, 0)
    } else {
      // Afternoon Shift
      shiftType = 'Afternoon Shift'
      shiftStart.setHours(14, 0, 0, 0)
      shiftEnd.setHours(22, 0, 0, 0)
    }
    
    const formatTime = (date) => {
      const h = date.getHours()
      const m = date.getMinutes()
      const period = h >= 12 ? 'pm' : 'am'
      const hour12 = h % 12 || 12
      return `${hour12}:${String(m).padStart(2, '0')} ${period}`
    }
    
    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      return `${day} | ${month} | ${year}`
    }
    
    return {
      shift: `${shiftType} ${formatDate(shiftStart)} | ${formatTime(shiftStart)} - ${formatTime(shiftEnd)}`,
      startTime: formatTime(shiftStart),
      endTime: formatTime(shiftEnd)
    }
  }

  const shiftInfo = getShiftInfo()

  // Machine #1 데이터와 동기화
  const performanceData = {
    quality: machineData?.quality || 72,
    performance: machineData?.performance || 80,
    availability: machineData?.availability || 65,
    oee: machineData?.oee || machineData?.productionEfficiency || 65
  }

  // 성능 지표 색상 코딩 함수
  const getPerformanceClass = (value) => {
    if (value >= 85) return 'excellent'
    if (value >= 70) return 'good'
    if (value >= 50) return 'warning'
    return 'danger'
  }

  // 성능 지표에 따른 색상 반환 함수
  const getPerformanceColor = (value) => {
    if (value >= 85) return '#10b981' // 초록색 (excellent)
    if (value >= 70) return '#3b82f6' // 파란색 (good)
    if (value >= 50) return '#f59e0b' // 노란색 (warning)
    return '#ef4444' // 빨간색 (danger)
  }

  // 성능 지표 컴포넌트
  const PerformanceValue = ({ value }) => {
    const performanceClass = getPerformanceClass(value)
    return (
      <span className={`performance-value ${performanceClass}`}>
        {value}%
        <div className="performance-gauge">
          <div 
            className="performance-gauge-fill" 
            style={{ width: `${value}%` }}
          />
        </div>
      </span>
    )
  }

  // ECharts Performance Overview 바 그래프 옵션
  const performanceBarData = [
    { value: performanceData.quality, name: 'Quality', itemStyle: { color: '#8b5cf6' } }, // 보라색
    { value: performanceData.performance, name: 'Performance', itemStyle: { color: '#06b6d4' } }, // 청록색
    { value: performanceData.availability, name: 'Availability', itemStyle: { color: '#10b981' } }, // 에메랄드 그린
    { value: performanceData.oee, name: 'OEE', itemStyle: { color: '#3b82f6' } } // 파란색
  ]

  const performanceBarOption = {
    grid: { 
      containLabel: true,
      left: '0%',
      right: '5%',
      top: '10%',
      bottom: '10%'
    },
    xAxis: { 
      type: 'value',
      min: 0,
      max: 100,
      name: '%',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        color: '#9ca3af',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: '#30363d'
        }
      },
      axisLabel: {
        color: '#7d8590',
        fontSize: 11,
        formatter: '{value}%'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)',
          type: 'dashed'
        }
      }
    },
    yAxis: { 
      type: 'category',
      data: performanceBarData.map(item => item.name),
      axisLine: {
        lineStyle: {
          color: '#30363d'
        }
      },
      axisLabel: {
        color: '#9ca3af',
        fontSize: 12
      },
      axisTick: {
        show: false
      }
    },
    series: [
      {
        type: 'bar',
        data: performanceBarData,
        barWidth: '50%',
        itemStyle: {
          borderRadius: [0, 4, 4, 0]
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c}%',
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600
        }
      }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#e5e7eb'
      },
      formatter: function(params) {
        const param = params[0]
        return `${param.name}<br/>${param.seriesName}: ${param.value}%`
      }
    }
  }

  const productionStatus = {
    production: 65,
    scheduledDowntime: 20,
    unscheduledDowntime: 10,
    standbyTime: 5
  }

  const shiftSummary = {
    shift: shiftInfo.shift,
    actual: {
      availability: machineData?.availability || 65,
      performance: machineData?.performance || 80,
      quality: machineData?.quality || 72,
      mtbf: '2:23 h',
      mttr: '0:06 h',
      targetActual: `${machineData?.targetParts || 4800} / ${machineData?.actualParts || machineData?.producedParts || 4230}`
    },
    average: {
      availability: 75,
      performance: 80,
      quality: 85,
      mtbf: '0:55 h',
      mttr: '0:07 h'
    }
  }

  const articles = [
    {
      id: 'XX-XX-01',
      time: '10:05 pm - 01:30 am',
      availability: 96,
      performance: 98,
      quality: 72,
      mtbf: '1:26 h',
      mttr: '0:02 h',
      targetActual: '2500 / 2376',
      average: {
        availability: 82,
        performance: 78,
        quality: 82,
        mtbf: '1:22 h',
        mttr: '0:12 h'
      }
    },
    {
      id: 'XX-XX-02',
      time: '01:36 am - 04:02 am',
      availability: 88,
      performance: 92,
      quality: 85,
      mtbf: '1:15 h',
      mttr: '0:05 h',
      targetActual: '1800 / 1656',
      average: {
        availability: 82,
        performance: 78,
        quality: 82,
        mtbf: '1:22 h',
        mttr: '0:12 h'
      }
    },
    {
      id: 'XX-XX-03',
      time: '04:28 am - 05:19 am',
      availability: 75,
      performance: 85,
      quality: 78,
      mtbf: '0:45 h',
      mttr: '0:08 h',
      targetActual: '1200 / 1020',
      average: {
        availability: 82,
        performance: 78,
        quality: 82,
        mtbf: '1:22 h',
        mttr: '0:12 h'
      }
    },
    {
      id: 'XX-XX-04',
      time: '05:35 am - 06:02 am',
      availability: 90,
      performance: 88,
      quality: 80,
      mtbf: '1:10 h',
      mttr: '0:04 h',
      targetActual: '800 / 720',
      average: {
        availability: 82,
        performance: 78,
        quality: 82,
        mtbf: '1:22 h',
        mttr: '0:12 h'
      }
    }
  ]

  const toggleArticle = (index) => {
    setExpandedArticles(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const topErrors = [
    { name: 'Unplanned Meeting', duration: 65 },
    { name: 'Quality Issue', duration: 30 },
    { name: 'No Load Carrier', duration: 25 },
    { name: 'Setup External', duration: 10 },
    { name: 'Setup Internal', duration: 5 },
    { name: 'Unplanned Break', duration: 2 },
    { name: 'Machine Repair', duration: 1 },
    { name: 'Machine Error Transfer', duration: 1 },
    { name: 'Machine Error FGL', duration: 1 },
    { name: 'No Blanks FGL', duration: 0 }
  ]


  // ECharts 바 그래프 옵션 (dataset 사용)
  const errorsBarOption = {
    dataset: {
      source: [
        ['duration', 'error'],
        ...topErrors.map(error => [error.duration, error.name])
      ]
    },
    grid: { 
      containLabel: true,
      left: '3%',
      right: '5%',
      top: '5%',
      bottom: '15%'
    },
    xAxis: { 
      type: 'value',
      min: 0,
      max: 100,
      name: 'min',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        color: '#9ca3af',
        fontSize: 12
      },
      axisLine: {
        lineStyle: {
          color: '#30363d'
        }
      },
      axisLabel: {
        color: '#7d8590',
        fontSize: 11
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)',
          type: 'dashed'
        }
      }
    },
    yAxis: { 
      type: 'category',
      axisLine: {
        lineStyle: {
          color: '#30363d'
        }
      },
      axisLabel: {
        color: '#9ca3af',
        fontSize: 11
      },
      axisTick: {
        show: false
      }
    },
    visualMap: {
      orient: 'horizontal',
      left: 'center',
      top: 'bottom',
      min: 0,
      max: 100,
      text: ['High Duration', 'Low Duration'],
      textStyle: {
        color: '#9ca3af',
        fontSize: 11
      },
      dimension: 0,
      inRange: {
        // 원래 그라데이션 색상
        color: ['#3b82f6', '#8b5cf6', '#ec4899']
      },
      itemWidth: 12,
      itemHeight: 200,
      width: 500
    },
    series: [
      {
        type: 'bar',
        encode: {
          x: 'duration',
          y: 'error'
        },
        barWidth: '60%',
        itemStyle: {
          borderRadius: [0, 4, 4, 0]
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{@duration} min',
          color: '#e5e7eb',
          fontSize: 11,
          fontWeight: 500
        }
      }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#e5e7eb'
      },
      formatter: function(params) {
        const param = params[0]
        return `${param.name}<br/>${param.seriesName}: ${param.value} min`
      }
    }
  }

  // ECharts 파이 차트 옵션
  const pieChartOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: {
        color: '#e5e7eb'
      },
      formatter: '{b}: {c}% ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: {
        color: '#d1d5db',
        fontSize: 12
      },
      itemGap: 8
    },
    series: [
      {
        name: 'Production Status',
        type: 'pie',
        radius: '50%',
        center: ['50%', '50%'],
        data: [
          { value: productionStatus.production, name: 'Production', itemStyle: { color: '#10b981' } }, // 초록색 - 생산 중 (좋음)
          { value: productionStatus.scheduledDowntime, name: 'Scheduled Downtime', itemStyle: { color: '#3b82f6' } }, // 파란색 - 계획된 다운타임 (정상)
          { value: productionStatus.unscheduledDowntime, name: 'Unscheduled Downtime', itemStyle: { color: '#ef4444' } }, // 빨간색 - 계획되지 않은 다운타임 (나쁨)
          { value: productionStatus.standbyTime, name: 'Standby Time', itemStyle: { color: '#6b7280' } } // 회색 - 대기 시간 (중립)
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        label: {
          show: true,
          formatter: '{d}%',
          color: '#e5e7eb',
          fontSize: 11
        },
        labelLine: {
          show: true,
          lineStyle: {
            color: '#6b7280'
          }
        }
      }
    ]
  }

  return (
    <div className="shift-report">
      <div className="shift-report-grid">
        {/* Performance Overview */}
        <div className="performance-overview">
          <h3 className="section-title">
            <svg className="section-title-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Performance Overview
          </h3>
          <div className="performance-chart">
            <ReactECharts 
              option={performanceBarOption} 
              style={{ height: '250px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </div>

        {/* Production Status */}
        <div className="production-status">
          <h3 className="section-title">
            <svg className="section-title-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Production Status
          </h3>
          <div className="pie-chart-container">
            <ReactECharts 
              option={pieChartOption} 
              style={{ height: '300px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </div>

        {/* Shift Summary */}
        <div className="shift-summary">
          <h3 className="section-title">
            <svg className="section-title-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {shiftSummary.shift}
          </h3>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Availability</th>
                <th>Performance</th>
                <th>Quality</th>
                <th>MTBF</th>
                <th>MTTR</th>
                <th>Target/Actual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><PerformanceValue value={shiftSummary.actual.availability} /></td>
                <td><PerformanceValue value={shiftSummary.actual.performance} /></td>
                <td><PerformanceValue value={shiftSummary.actual.quality} /></td>
                <td>{shiftSummary.actual.mtbf}</td>
                <td>{shiftSummary.actual.mttr}</td>
                <td>
                  <div className="target-actual-cell">
                    {shiftSummary.actual.targetActual}
                    <button className="shift-book-btn">Shift Book</button>
                  </div>
                </td>
              </tr>
              <tr className="average-row">
                <td><PerformanceValue value={shiftSummary.average.availability} /></td>
                <td><PerformanceValue value={shiftSummary.average.performance} /></td>
                <td><PerformanceValue value={shiftSummary.average.quality} /></td>
                <td>{shiftSummary.average.mtbf}</td>
                <td>{shiftSummary.average.mttr}</td>
                <td>Shift Average</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Article Details */}
        <div className="article-details">
          <h3 className="section-title">
            <svg className="section-title-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Article Details
          </h3>
          <div className="article-list">
            {articles.map((article, index) => (
              <div 
                key={index} 
                className={`article-item ${expandedArticles[index] ? 'expanded' : ''}`}
              >
                <div 
                  className="article-header"
                  onClick={() => toggleArticle(index)}
                >
                  <span className="article-chevron">{expandedArticles[index] ? '▼' : '▶'}</span>
                  <span className="article-id">Article {article.id}</span>
                  <span className="article-time">{article.time}</span>
                </div>
                <div className={`article-content ${expandedArticles[index] ? 'expanded' : ''}`}>
                  <table className="article-table">
                    <thead>
                      <tr>
                        <th>Availability</th>
                        <th>Performance</th>
                        <th>Quality</th>
                        <th>MTBF</th>
                        <th>MTTR</th>
                        <th>Target/Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><PerformanceValue value={article.availability} /></td>
                        <td><PerformanceValue value={article.performance} /></td>
                        <td><PerformanceValue value={article.quality} /></td>
                        <td>{article.mtbf}</td>
                        <td>{article.mttr}</td>
                        <td>{article.targetActual}</td>
                      </tr>
                      <tr className="average-row">
                        <td><PerformanceValue value={article.average.availability} /></td>
                        <td><PerformanceValue value={article.average.performance} /></td>
                        <td><PerformanceValue value={article.average.quality} /></td>
                        <td>{article.average.mtbf}</td>
                        <td>{article.average.mttr}</td>
                        <td>Article Average</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Ten Errors */}
        <div className="top-errors">
          <h3 className="section-title">
            <svg className="section-title-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            TOP TEN ERRORS
          </h3>
          <div className="errors-chart">
            <ReactECharts 
              option={errorsBarOption} 
              style={{ height: '450px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

ShiftReport.displayName = 'ShiftReport'

export default ShiftReport
