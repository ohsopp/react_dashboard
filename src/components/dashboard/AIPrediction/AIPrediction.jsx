import { useState, useEffect, useMemo, useRef } from 'react'
import Sortable from 'sortablejs'
import Chart from '../Chart/Chart'
import PanelHeader from '../PanelHeader/PanelHeader'
import '../Panel/Panel.css'
import './AIPrediction.css'

const AIPrediction = ({ selectedRange, onSelectRange }) => {
  const [augmentedTemp, setAugmentedTemp] = useState({ timestamps: [], values: [] })
  const [augmentedVib, setAugmentedVib] = useState({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [augmenting, setAugmenting] = useState(false)
  const [training, setTraining] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [augmentProgress, setAugmentProgress] = useState({ progress: 0, message: '' })
  const [trainProgress, setTrainProgress] = useState({ progress: 0, message: '' })
  const [panelOrder, setPanelOrder] = useState([0, 1]) // 온도, 진동 순서
  const containerRef = useRef(null)
  const sortableInstance = useRef(null)

  useEffect(() => {
    fetchAugmentedData()
    
    // 증강 데이터는 자주 업데이트할 필요 없음 (한 번 생성되면 고정)
    // 예측만 주기적으로 업데이트 (학습 중이 아닐 때만)
    let predictionInterval = null
    
    // 학습 중이 아닐 때만 예측 호출 및 인터벌 설정
    if (!training) {
      fetchPrediction()
      predictionInterval = setInterval(() => {
        if (!training) {
          fetchPrediction()
        }
      }, 10000) // 10초마다 예측만 업데이트
    }

    return () => {
      if (predictionInterval) {
        clearInterval(predictionInterval)
      }
    }
  }, [selectedRange, training])

  // 새로고침 이벤트 리스너
  useEffect(() => {
    const handleRefresh = () => {
      fetchAugmentedData()
      if (!training) {
        fetchPrediction()
      }
    }

    window.addEventListener('ai-refresh', handleRefresh)
    return () => {
      window.removeEventListener('ai-refresh', handleRefresh)
    }
  }, [training])

  // 진행률 조회
  useEffect(() => {
    const fetchProgress = async () => {
      if (augmenting) {
        try {
          const res = await fetch('/api/ai/progress/augment')
          if (res.ok) {
            const data = await res.json()
            console.log('증강 진행률:', data) // 디버깅용
            
            // 에러가 있으면 표시
            if (data.error) {
              console.error('진행률 조회 에러:', data.error)
              setAugmentProgress({ progress: 0, message: `오류: ${data.error}` })
              return
            }
            
            // 진행률 업데이트 (stage가 not_started가 아니면 진행률 표시)
            if (data.stage && data.stage !== 'not_started') {
              const progress = typeof data.progress === 'number' ? data.progress : 0
              const message = data.message || '진행 중...'
              setAugmentProgress({ progress, message })
              
              // 완료 확인
              if (progress >= 100 || data.stage === 'complete') {
                setAugmenting(false)
                setTimeout(() => fetchAugmentedData(), 2000) // 데이터 새로고침
              }
            } else if (data.stage === 'not_started') {
              // 아직 시작되지 않았지만 augmenting이 true면 대기
              setAugmentProgress({ progress: 0, message: '시작 대기 중...' })
            } else {
              // progress가 직접 있는 경우
              const progress = typeof data.progress === 'number' ? data.progress : 0
              const message = data.message || '진행 중...'
              setAugmentProgress({ progress, message })
              
              if (progress >= 100) {
                setAugmenting(false)
                setTimeout(() => fetchAugmentedData(), 2000)
              }
            }
          } else {
            // 응답이 실패한 경우
            const errorData = await res.json().catch(() => ({ error: '진행률 조회 실패' }))
            console.error('진행률 조회 실패:', errorData)
            setAugmentProgress({ progress: 0, message: `조회 실패: ${errorData.error || '알 수 없는 오류'}` })
          }
        } catch (error) {
          console.error('진행률 조회 실패:', error)
          // 네트워크 오류 등으로 조회 실패해도 프로그레스바는 유지
          setAugmentProgress(prev => ({ 
            progress: prev.progress, 
            message: prev.message || '진행률 조회 중...' 
          }))
        }
      }
      
      if (training) {
        try {
          const res = await fetch('/api/ai/progress/train')
          if (res.ok) {
            const data = await res.json()
            console.log('학습 진행률:', data) // 디버깅용
            
            // 에러가 있으면 표시하고 학습 중지
            if (data.error || data.stage === 'error') {
              const errorMsg = data.error || data.message || '알 수 없는 오류'
              console.error('학습 진행률 에러:', errorMsg)
              setTrainProgress({ progress: 0, message: `오류: ${errorMsg}` })
              setTraining(false)
              setStatusMessage({ type: 'error', text: `모델 학습 오류: ${errorMsg}` })
              return
            }
            
            // 진행률 업데이트 (stage가 not_started가 아니면 진행률 표시)
            if (data.stage && data.stage !== 'not_started') {
              const progress = typeof data.progress === 'number' ? data.progress : 0
              let message = data.message || '진행 중...'
              
              // 예상 시간이 있으면 메시지에 추가
              if (data.estimated_time_minutes) {
                const minutes = Math.floor(data.estimated_time_minutes)
                const seconds = Math.floor((data.estimated_time_minutes - minutes) * 60)
                if (minutes > 0) {
                  message += ` (예상 소요 시간: 약 ${minutes}분 ${seconds}초)`
                } else {
                  message += ` (예상 소요 시간: 약 ${seconds}초)`
                }
              }
              
              setTrainProgress({ progress, message })
              
              // 완료 확인
              if (progress >= 100 || data.stage === 'complete') {
                setTraining(false)
                setStatusMessage({ type: 'success', text: '모델 학습이 완료되었습니다.' })
                // 학습 완료 후 예측 다시 호출
                setTimeout(() => {
                  fetchPrediction()
                }, 2000) // 2초 후 예측 호출
              }
            } else if (data.stage === 'not_started') {
              // 아직 시작되지 않았지만 training이 true면 대기
              setTrainProgress({ progress: 0, message: '시작 대기 중...' })
            } else {
              // progress가 직접 있는 경우
              const progress = typeof data.progress === 'number' ? data.progress : 0
              const message = data.message || '진행 중...'
              setTrainProgress({ progress, message })
              
              if (progress >= 100) {
                setTraining(false)
                setStatusMessage({ type: 'success', text: '모델 학습이 완료되었습니다.' })
              }
            }
          } else {
            // 응답이 실패한 경우
            const errorData = await res.json().catch(() => ({ error: '진행률 조회 실패' }))
            console.error('진행률 조회 실패:', errorData)
            setTrainProgress({ progress: 0, message: `조회 실패: ${errorData.error || '알 수 없는 오류'}` })
          }
        } catch (error) {
          console.error('진행률 조회 실패:', error)
          // 네트워크 오류 등으로 조회 실패해도 프로그레스바는 유지
          setTrainProgress(prev => ({ 
            progress: prev.progress, 
            message: prev.message || '진행률 조회 중...' 
          }))
        }
      }
    }

    // 즉시 한 번 실행
    fetchProgress()
    
    const progressInterval = setInterval(fetchProgress, 1000) // 1초마다 조회
    return () => clearInterval(progressInterval)
  }, [augmenting, training])

  const fetchAugmentedData = async () => {
    try {
      setError(null)
      const [tempRes, vibRes] = await Promise.all([
        fetch(`/api/ai/augmented/temperature?range=${selectedRange}`),
        fetch(`/api/ai/augmented/vibration?range=${selectedRange}`)
      ])

      if (tempRes.ok) {
        const tempData = await tempRes.json()
        if (tempData.error) {
          setError(tempData.error)
        } else {
          setAugmentedTemp({
            timestamps: tempData.timestamps || [],
            values: tempData.values || []
          })
        }
      } else {
        const errorData = await tempRes.json().catch(() => ({}))
        setError(errorData.error || '증강 데이터를 가져올 수 없습니다')
      }

      if (vibRes.ok) {
        const vibData = await vibRes.json()
        if (!vibData.error) {
          setAugmentedVib({
            timestamps: vibData.timestamps || [],
            v_rms: vibData.v_rms || [],
            a_peak: vibData.a_peak || [],
            a_rms: vibData.a_rms || [],
            crest: vibData.crest || [],
            temperature: vibData.temperature || []
          })
        }
      }
    } catch (error) {
      console.error('증강 데이터 가져오기 실패:', error)
      setError('데이터를 불러오는 중 오류가 발생했습니다')
    }
  }

  const fetchPrediction = async () => {
    // 학습 중이면 예측 호출하지 않음
    if (training) {
      return
    }
    
    // 이미 로딩 중이면 중복 호출 방지
    if (loading) {
      return
    }
    
    setLoading(true)
    try {
      const response = await fetch('/api/ai/predict')
      if (response.ok) {
        const data = await response.json()
        setPrediction(data)
        setError(null)
        setLoading(false)
      } else if (response.status === 503) {
        // 학습 중이거나 서비스 사용 불가
        const data = await response.json().catch(() => ({}))
        console.log('예측 불가 (학습 중 또는 모델 없음):', data.message || data.error)
        // 에러를 표시하지 않고 조용히 무시
        setPrediction(null)
        setLoading(false)
      } else if (response.status === 404) {
        // 모델이 없음
        const data = await response.json().catch(() => ({}))
        console.log('모델 없음:', data.error)
        setPrediction(null)
        setLoading(false)
      } else {
        const data = await response.json().catch(() => ({ error: '예측 실패' }))
        console.error('예측 실패:', data.error)
        setError(data.error || '예측을 수행할 수 없습니다')
        setLoading(false)
      }
    } catch (error) {
      console.error('예측 데이터 가져오기 실패:', error)
      // 네트워크 오류 등은 조용히 무시 (재시도될 것임)
      setLoading(false)
    }
  }

  const handleAugment = async () => {
    setAugmenting(true)
    setStatusMessage(null)
    setAugmentProgress({ progress: 0, message: '시작 중...' })
    try {
      const response = await fetch('/api/ai/augment', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (response.ok) {
        // 성공 메시지 제거 - 진행률만 표시
        // 진행률 조회 시작 - 즉시 한 번 조회
        setTimeout(async () => {
          try {
            const res = await fetch('/api/ai/progress/augment')
            if (res.ok) {
              const progressData = await res.json()
              if (progressData.progress !== undefined) {
                setAugmentProgress({ 
                  progress: progressData.progress || 0, 
                  message: progressData.message || '진행 중...' 
                })
              }
            }
          } catch (e) {
            console.error('초기 진행률 조회 실패:', e)
          }
        }, 500)
      } else {
        setStatusMessage({ type: 'error', text: data.error || '데이터 증강 실패' })
        setAugmenting(false)
        setAugmentProgress({ progress: 0, message: '' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: '데이터 증강 중 오류가 발생했습니다.' })
      console.error('데이터 증강 실패:', error)
      setAugmenting(false)
      setAugmentProgress({ progress: 0, message: '' })
    }
  }

  const handleTrain = async () => {
    setTraining(true)
    setStatusMessage(null)
    setTrainProgress({ progress: 0, message: '시작 중...' })
    try {
      const response = await fetch('/api/ai/train', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (response.ok) {
        // 성공 메시지 제거 - 진행률만 표시
        // 진행률 조회 시작 - 즉시 한 번 조회
        setTimeout(async () => {
          try {
            const res = await fetch('/api/ai/progress/train')
            if (res.ok) {
              const progressData = await res.json()
              if (progressData.progress !== undefined) {
                setTrainProgress({ 
                  progress: progressData.progress || 0, 
                  message: progressData.message || '진행 중...' 
                })
              }
            }
          } catch (e) {
            console.error('초기 진행률 조회 실패:', e)
          }
        }, 500)
      } else {
        setStatusMessage({ type: 'error', text: data.error || '모델 학습 실패' })
        setTraining(false)
        setTrainProgress({ progress: 0, message: '' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: '모델 학습 중 오류가 발생했습니다.' })
      console.error('모델 학습 실패:', error)
      setTraining(false)
      setTrainProgress({ progress: 0, message: '' })
    }
    // finally에서 setTraining(false) 제거 - 진행률이 100%가 될 때까지 유지
  }

  const handleStopTrain = async () => {
    try {
      const response = await fetch('/api/ai/train/stop', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (response.ok) {
        setStatusMessage({ type: 'success', text: data.message || '학습이 중지되었습니다.' })
        setTraining(false)
        setTrainProgress({ progress: 0, message: '학습이 중지되었습니다.' })
      } else {
        setStatusMessage({ type: 'error', text: data.error || '학습 중지 실패' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: '학습 중지 중 오류가 발생했습니다.' })
      console.error('학습 중지 실패:', error)
    }
  }

  // SortableJS 초기화 (센서 탭과 동일한 방식)
  useEffect(() => {
    const initSortable = () => {
      if (!containerRef.current) return

      // 기존 인스턴스 제거
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
        sortableInstance.current = null
      }

      // SortableJS 인스턴스 생성
      try {
        sortableInstance.current = new Sortable(containerRef.current, {
          animation: 150,
          ghostClass: 'sortable-ghost',
          chosenClass: 'sortable-chosen',
          dragClass: 'sortable-drag',
          filter: '.panel-resize-handle, button, .panel-modal-close',
          preventOnFilter: false,
          
          onStart: (evt) => {
            evt.item.classList.add('dragging', 'sortable-selected')
          },
          
          onEnd: (evt) => {
            const panel = evt.item
            panel.classList.remove('dragging', 'sortable-selected')
            
            const oldIndex = evt.oldIndex
            const newIndex = evt.newIndex
            
            if (oldIndex !== newIndex) {
              const newOrder = [...panelOrder]
              const [draggedOrder] = newOrder.splice(oldIndex, 1)
              newOrder.splice(newIndex, 0, draggedOrder)
              setPanelOrder(newOrder)
            }
          }
        })
      } catch (error) {
        console.error('SortableJS 초기화 실패:', error)
      }
    }

    // DOM이 렌더링될 때까지 대기
    const timer = setTimeout(initSortable, 100)

    return () => {
      clearTimeout(timer)
      if (sortableInstance.current) {
        sortableInstance.current.destroy()
        sortableInstance.current = null
      }
    }
  }, [panelOrder])

  // 패널 설정 (온도: 0, 진동: 1)
  const panelConfigs = [
    { id: 'aug-temp-panel', size: 6 }, // 온도 패널 (6칸 = 1/2)
    { id: 'aug-vib-panel', size: 6 }   // 진동 패널 (6칸 = 1/2)
  ]

  // 차트 데이터를 메모이제이션하여 불필요한 리렌더링 방지
  const augmentedTempChartData = useMemo(() => {
    if (augmentedTemp.timestamps.length === 0) return null
    return {
      labels: augmentedTemp.timestamps.map(ts => {
        const date = new Date(ts)
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      }),
      timestamps: augmentedTemp.timestamps,
      datasets: [{
        label: 'Augmented Temperature',
        data: augmentedTemp.values,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)'
      }]
    }
  }, [augmentedTemp.timestamps, augmentedTemp.values])
  
  // 차트 옵션도 메모이제이션 (센서 탭과 동일한 스타일)
  const DEFAULT_PANEL_GRID = {
    left: '25px',
    right: '25px',
    bottom: '10px',
    top: '10%'
  }
  
  const augmentedTempChartOptions = useMemo(() => ({
    yAxis: {
      min: 0,
      max: 50,
      scale: false, // 자동 스케일링 비활성화 (고정 범위 유지)
      axisLabel: {
        formatter: '{value}°C'
      }
    },
    animation: false,
    sampling: 'lttb',
    grid: DEFAULT_PANEL_GRID,
    dataZoom: [] // dataZoom 비활성화하여 Y축 범위 고정
  }), [])

  // 증강 진동 데이터 차트 데이터 메모이제이션 (항상 호출되어야 함)
  const augmentedVibChartData = useMemo(() => {
    if (augmentedVib.timestamps.length === 0) return null
    
    return {
      labels: augmentedVib.timestamps.map(ts => {
        const date = new Date(ts)
        if (selectedRange === '7d') {
          return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + 
                 date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        } else {
          return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        }
      }),
      timestamps: augmentedVib.timestamps,
      datasets: [
        {
          label: 'v-RMS (mm/s)',
          data: (augmentedVib.v_rms || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.2)'
        },
        {
          label: 'a-Peak (m/s²)',
          data: (augmentedVib.a_peak || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#f093fb',
          backgroundColor: 'rgba(240, 147, 251, 0.2)'
        },
        {
          label: 'a-RMS (m/s²)',
          data: (augmentedVib.a_rms || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#11998e',
          backgroundColor: 'rgba(17, 153, 142, 0.2)'
        },
        {
          label: 'Crest',
          data: (augmentedVib.crest || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#ffa500',
          backgroundColor: 'rgba(255, 165, 0, 0.2)'
        }
      ]
    }
  }, [augmentedVib.timestamps, augmentedVib.v_rms, augmentedVib.a_peak, augmentedVib.a_rms, augmentedVib.crest, selectedRange])
  
  // 증강 진동 데이터 차트 옵션 메모이제이션 (항상 호출되어야 함)
  const augmentedVibChartOptions = useMemo(() => ({
    animation: false,
    sampling: 'lttb',
    grid: DEFAULT_PANEL_GRID,
    yAxis: {
      scale: true, // 자동 스케일링 허용
      axisLabel: {
        formatter: '{value}'
      }
    },
    dataZoom: [] // dataZoom 비활성화
  }), [])

  return (
    <div className="ai-prediction">
      <div className="ai-prediction-content">
        {/* 액션 버튼 */}
        <div className="action-buttons">
          <div className="action-group">
            <button 
              className="action-btn augment-btn" 
              onClick={handleAugment}
              disabled={augmenting}
            >
              데이터 증강
            </button>
            {augmenting && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${Math.max(0, Math.min(100, augmentProgress.progress || 0))}%` }}
                  ></div>
                </div>
                <div className="progress-text">
                  {augmentProgress.progress || 0}% - {augmentProgress.message || '진행 중...'}
                </div>
              </div>
            )}
          </div>
          
          <div className="action-group">
            <button 
              className="action-btn train-btn" 
              onClick={handleTrain}
              disabled={training}
            >
              모델 학습
            </button>
            {training && (
              <>
                <button 
                  className="action-btn stop-btn" 
                  onClick={handleStopTrain}
                >
                  중지
                </button>
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill train-fill" 
                      style={{ width: `${trainProgress.progress}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {trainProgress.progress}% - {trainProgress.message || '진행 중...'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 상태 메시지 */}
        {statusMessage && (
          <div className={`status-message ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="error-message">
            <h3>⚠️ 데이터 준비 필요</h3>
            <p>{error}</p>
            <p>위의 "데이터 증강 실행" 버튼을 클릭하여 증강 데이터를 생성하세요.</p>
          </div>
        )}

        {/* 예측 결과 패널 */}
        {prediction && !prediction.error && (
          <div className="prediction-panel">
            <h3>예측 결과</h3>
            <div className="prediction-info">
              <div className="prediction-item">
                <span className="label">예측 온도:</span>
                <span className="value">{prediction.prediction?.predicted_temperature?.toFixed(2)}°C</span>
              </div>
              <div className="prediction-item">
                <span className="label">실제 온도:</span>
                <span className="value">{prediction.actual?.temperature?.toFixed(2)}°C</span>
              </div>
              <div className="prediction-item">
                <span className="label">예측 진동:</span>
                <span className="value">{prediction.prediction?.predicted_vibration?.toFixed(2)}</span>
              </div>
              <div className="prediction-item">
                <span className="label">실제 진동:</span>
                <span className="value">{prediction.actual?.vibration?.toFixed(2)}</span>
              </div>
            </div>
            
            <div className={`anomaly-detection ${prediction.anomaly?.is_anomaly ? 'anomaly' : 'normal'}`}>
              <h4>이상 탐지 결과</h4>
              <p className="anomaly-reason">{prediction.anomaly?.reason || '분석 중...'}</p>
              {prediction.anomaly?.anomaly_type && (
                <p className="anomaly-type">유형: {prediction.anomaly.anomaly_type}</p>
              )}
            </div>
          </div>
        )}

        {/* 증강 데이터 패널 그리드 - 센서 탭과 동일한 구조 */}
        <div 
          ref={containerRef}
          className="dashboard-container"
          id="augmented-dashboard-container"
        >
          {panelOrder.map((orderIndex) => {
            const config = panelConfigs[orderIndex]
            if (!config) return null

            if (config.id === 'aug-temp-panel') {
              return (
                <div 
                  key="aug-temp-panel"
                  className="panel" 
                  id="aug-temp-panel"
                  data-panel-id="aug-temp-panel"
                  style={{ gridColumn: `span ${config.size}` }}
                >
                  <PanelHeader title="Augmented Temperature History" showCsv={false} showExtension={false} />
                  <div className="panel-content">
                    {augmentedTempChartData ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                        <Chart
                          key={`aug-temp-${selectedRange}`}
                          type="line"
                          data={augmentedTempChartData}
                          options={augmentedTempChartOptions}
                          timeRange={selectedRange}
                        />
                      </div>
                    ) : (
                      <div className="chart-placeholder">
                        데이터를 불러오는 중...
                      </div>
                    )}
                  </div>
                </div>
              )
            } else if (config.id === 'aug-vib-panel') {
              return (
                <div 
                  key="aug-vib-panel"
                  className="panel" 
                  id="aug-vib-panel"
                  data-panel-id="aug-vib-panel"
                  style={{ gridColumn: `span ${config.size}` }}
                >
                  <PanelHeader title="Augmented Vibration History" showCsv={false} showExtension={false} />
                  <div className="panel-content">
                    {augmentedVibChartData ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                        <Chart
                          key={`aug-vib-${selectedRange}`}
                          type="line"
                          data={augmentedVibChartData}
                          options={augmentedVibChartOptions}
                          timeRange={selectedRange}
                        />
                      </div>
                    ) : (
                      <div className="chart-placeholder">
                        데이터를 불러오는 중...
                      </div>
                    )}
                  </div>
                </div>
              )
            }
            return null
          })}
        </div>

        {loading && !prediction && <div className="loading">예측 중...</div>}

        {/* 데이터가 없을 때 안내 메시지 */}
        {!error && !loading && !prediction && augmentedTemp.timestamps.length === 0 && augmentedVib.timestamps.length === 0 && (
          <div className="no-data-message">
            <h3>📊 데이터 준비 중</h3>
            <p>증강 데이터가 아직 생성되지 않았습니다.</p>
            <p>데이터 증강 스크립트를 실행해주세요:</p>
            <div className="code-block">
              <code>cd /home/uit/SIMPAC/ai_ml</code><br/>
              <code>pip install -r requirements.txt</code><br/>
              <code>python scripts/data_augmentation.py</code>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIPrediction
