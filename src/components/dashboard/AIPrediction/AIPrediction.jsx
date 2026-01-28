import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Sortable from 'sortablejs'
import Chart from '../Chart/Chart'
import PanelHeader from '../PanelHeader/PanelHeader'
import '../Panel/Panel.css'
import './AIPrediction.css'

const AIPrediction = ({ selectedRange, onSelectRange }) => {
  const [augmentedTemp, setAugmentedTemp] = useState({ timestamps: [], values: [] })
  const [augmentedVib, setAugmentedVib] = useState({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
  const [originalTemp, setOriginalTemp] = useState({ timestamps: [], values: [] })
  const [originalVib, setOriginalVib] = useState({ timestamps: [], v_rms: [], a_peak: [], a_rms: [], crest: [], temperature: [] })
  const [useOriginalTemp, setUseOriginalTemp] = useState(false) // 원본 온도 사용 여부 (예측용)
  const [useOriginalVib, setUseOriginalVib] = useState(false) // 원본 진동 사용 여부 (예측용)
  // 체크박스 상태 (그래프 표시 여부)
  const [showAugmentedTemp, setShowAugmentedTemp] = useState(false) // 증강 온도 그래프 표시
  const [showAugmentedVib, setShowAugmentedVib] = useState(false) // 증강 진동 그래프 표시
  const [showOriginalTemp, setShowOriginalTemp] = useState(false) // 원본 온도 그래프 표시
  const [showOriginalVib, setShowOriginalVib] = useState(false) // 원본 진동 그래프 표시
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [augmenting, setAugmenting] = useState(false) // 증강 중 (온도+진동 통합)
  const [augmentTempCompleted, setAugmentTempCompleted] = useState(false) // 온도 증강 완료 상태
  const [augmentVibCompleted, setAugmentVibCompleted] = useState(false) // 진동 증강 완료 상태
  const [training, setTraining] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [augmentProgress, setAugmentProgress] = useState({ progress: 0, message: '' })
  const [trainProgress, setTrainProgress] = useState({ progress: 0, message: '', remainingTime: null })
  const [selectedModel, setSelectedModel] = useState('lstm') // 선택된 모델 타입
  const [panelOrder, setPanelOrder] = useState([0, 1]) // 온도, 진동 순서
  const containerRef = useRef(null)
  const sortableInstance = useRef(null)

  // 원본 데이터 불러오기 함수들을 먼저 정의
  const fetchOriginalTemp = useCallback(async (showMessage = false) => {
    try {
      const response = await fetch(`/api/ai/original/temperature?range=${selectedRange}`)
      if (response.ok) {
        const data = await response.json()
        if (data.timestamps && data.timestamps.length > 0) {
          setOriginalTemp({
            timestamps: data.timestamps || [],
            values: data.values || []
          })
          setUseOriginalTemp(true) // 예측용으로 원본 사용
          if (showMessage) {
            setStatusMessage({ type: 'success', text: '원본 온도 데이터를 불러왔습니다.' })
          }
        } else {
          if (showMessage) {
            setStatusMessage({ type: 'error', text: '원본 온도 데이터가 없습니다.' })
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: '원본 온도 데이터 불러오기 실패' }))
        if (showMessage) {
          setStatusMessage({ type: 'error', text: errorData.error || '원본 온도 데이터 불러오기 실패' })
        }
      }
    } catch (error) {
      console.error('원본 온도 데이터 불러오기 실패:', error)
      if (showMessage) {
        setStatusMessage({ type: 'error', text: '원본 온도 데이터 불러오기 중 오류가 발생했습니다.' })
      }
    }
  }, [selectedRange])

  const fetchOriginalVib = useCallback(async (showMessage = false) => {
    try {
      const response = await fetch(`/api/ai/original/vibration?range=${selectedRange}`)
      if (response.ok) {
        const data = await response.json()
        if (data.timestamps && data.timestamps.length > 0) {
          setOriginalVib({
            timestamps: data.timestamps || [],
            v_rms: data.v_rms || [],
            a_peak: data.a_peak || [],
            a_rms: data.a_rms || [],
            crest: data.crest || [],
            temperature: data.temperature || []
          })
          setUseOriginalVib(true) // 예측용으로 원본 사용
          if (showMessage) {
            setStatusMessage({ type: 'success', text: '원본 진동 데이터를 불러왔습니다.' })
          }
        } else {
          if (showMessage) {
            setStatusMessage({ type: 'error', text: '원본 진동 데이터가 없습니다.' })
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: '원본 진동 데이터 불러오기 실패' }))
        if (showMessage) {
          setStatusMessage({ type: 'error', text: errorData.error || '원본 진동 데이터 불러오기 실패' })
        }
      }
    } catch (error) {
      console.error('원본 진동 데이터 불러오기 실패:', error)
      if (showMessage) {
        setStatusMessage({ type: 'error', text: '원본 진동 데이터 불러오기 중 오류가 발생했습니다.' })
      }
    }
  }, [selectedRange])

  useEffect(() => {
    fetchAugmentedData()
    // 원본 데이터는 체크박스로 불러오므로 여기서는 자동으로 불러오지 않음
    // 하지만 체크박스가 체크되어 있으면 자동으로 불러오기
    if (showOriginalTemp) {
      fetchOriginalTemp(false) // 자동 새로고침 시 메시지 표시 안 함
    }
    if (showOriginalVib) {
      fetchOriginalVib(false) // 자동 새로고침 시 메시지 표시 안 함
    }

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
  }, [selectedRange, training, showOriginalTemp, showOriginalVib, fetchOriginalTemp, fetchOriginalVib])

  // 새로고침 이벤트 리스너
  useEffect(() => {
    const handleRefresh = () => {
      fetchAugmentedData()
      if (showOriginalTemp) fetchOriginalTemp(false) // 자동 새로고침 시 메시지 표시 안 함
      if (showOriginalVib) fetchOriginalVib(false) // 자동 새로고침 시 메시지 표시 안 함
      if (!training) {
        fetchPrediction()
      }
    }

    window.addEventListener('ai-refresh', handleRefresh)
    return () => {
      window.removeEventListener('ai-refresh', handleRefresh)
    }
  }, [training, showOriginalTemp, showOriginalVib])

  // 성공 메시지 자동 제거 (3초 후)
  useEffect(() => {
    if (statusMessage && statusMessage.type === 'success') {
      const timer = setTimeout(() => {
        setStatusMessage(null)
      }, 3000) // 3초 후 자동 제거
      return () => clearTimeout(timer)
    }
  }, [statusMessage])

  // 진행률 조회
  useEffect(() => {
    const fetchProgress = async () => {
      if (augmenting) {
        try {
          const res = await fetch('/api/ai/progress/augment')
          if (res.ok) {
            const data = await res.json()
            console.log('증강 진행률:', data) // 디버깅용
            
            // 에러가 있으면 표시하고 증강 중지
            if (data.error) {
              console.error('진행률 조회 에러:', data.error)
              setAugmentProgress({ progress: 0, message: `오류: ${data.error}` })
              setStatusMessage({ type: 'error', text: `데이터 증강 오류: ${data.error}` })
              setAugmenting(false)
              return
            }
            
            // 진행률 업데이트 - 항상 업데이트하여 프로그레스바 유지
            let progress = 0
            let message = '시작 대기 중...'
            
            if (data.stage === 'not_started') {
              // 아직 시작되지 않았지만 증강 중이면 대기
              progress = 0
              message = '시작 대기 중...'
            } else if (data.stage && data.stage !== 'not_started') {
              // stage가 있고 not_started가 아니면 진행률 표시
              progress = typeof data.progress === 'number' ? data.progress : 0
              message = data.message || '진행 중...'
              
              // 완료 확인
              if (progress >= 100 || data.stage === 'complete') {
                setAugmentTempCompleted(true)
                setAugmentVibCompleted(true)
                setAugmenting(false)
                setTimeout(() => {
                  fetchAugmentedData()
                }, 2000) // 데이터 새로고침
                return
              }
            } else {
              // stage가 없거나 progress가 직접 있는 경우
              progress = typeof data.progress === 'number' ? data.progress : 0
              message = data.message || (progress === 0 ? '시작 대기 중...' : '진행 중...')
              
              if (progress >= 100) {
                setAugmentTempCompleted(true)
                setAugmentVibCompleted(true)
                setAugmenting(false)
                setTimeout(() => {
                  fetchAugmentedData()
                }, 2000)
                return
              }
            }
            
            // 항상 프로그레스바 업데이트
            setAugmentProgress({ progress, message })
          } else {
            // 응답이 실패한 경우에도 프로그레스바 유지
            const errorData = await res.json().catch(() => ({ error: '진행률 조회 실패' }))
            console.error('진행률 조회 실패:', errorData)
            // 이전 상태 유지하거나 기본값 설정
            setAugmentProgress(prev => ({ 
              progress: prev.progress || 0, 
              message: prev.message || '시작 대기 중...' 
            }))
            // 증강 상태는 유지 (사용자가 확인할 수 있도록)
          }
        } catch (error) {
          console.error('진행률 조회 실패:', error)
          // 네트워크 오류 등으로 조회 실패해도 프로그레스바는 유지
          setAugmentProgress(prev => ({ 
            progress: prev.progress || 0, 
            message: prev.message || '시작 대기 중...' 
          }))
        }
      } else {
        // 증강이 시작되었지만 진행률 조회가 안 되는 경우에도 프로그레스바 유지
        // 이 부분은 실제로는 실행되지 않아야 하지만 안전장치로 추가
        if (augmenting) {
          setAugmentProgress(prev => ({
            progress: prev.progress || 0,
            message: prev.message || '시작 대기 중...'
          }))
        }
      }
      
      if (training) {
        try {
          const res = await fetch('/api/ai/progress/train')
          if (res.ok) {
            const data = await res.json()
            console.log('학습 진행률:', data) // 디버깅용
            
            // 에러가 있으면 표시하지만 프로그레스바는 유지
            if (data.error || data.stage === 'error') {
              const errorMsg = data.error || data.message || '알 수 없는 오류'
              console.error('학습 진행률 에러:', errorMsg)
              setTrainProgress({ progress: 0, message: `오류: ${errorMsg}`, remainingTime: null })
              setStatusMessage({ type: 'error', text: `모델 학습 오류: ${errorMsg}` })
              // 에러가 발생해도 잠시 후에 false로 변경 (사용자가 에러를 확인할 수 있도록)
              setTimeout(() => {
                setTraining(false)
              }, 10000) // 10초 후에 프로그레스바 숨김
              return
            }
            
            // 진행률 업데이트 (stage가 not_started가 아니면 진행률 표시)
            if (data.stage && data.stage !== 'not_started') {
              const progress = typeof data.progress === 'number' ? data.progress : 0
              let message = data.message || '진행 중...'
              
              // 메시지에서 남은 시간 부분 추출 및 제거
              let remainingTime = null
              const timeMatch = message.match(/\[?남은\s*시간[:\s]*약?\s*([^\]]+)\]?/i)
              if (timeMatch) {
                // 메시지에서 남은 시간 부분 제거
                message = message.replace(/\[?남은\s*시간[:\s]*약?\s*[^\]]+\]?\s*/gi, '').trim()
                // 남은 시간 텍스트 추출 및 포맷팅
                const timeText = timeMatch[1].trim()
                // "13.1분" 형식을 "13분 10초" 형식으로 변환
                const minutesMatch = timeText.match(/(\d+(?:\.\d+)?)\s*분/)
                if (minutesMatch) {
                  const totalMinutes = parseFloat(minutesMatch[1])
                  const totalSeconds = Math.floor(totalMinutes * 60)
                  const mins = Math.floor(totalSeconds / 60)
                  const secs = totalSeconds % 60
                  if (mins > 0) {
                    remainingTime = `${mins}분 ${secs}초`
                  } else {
                    remainingTime = `${secs}초`
                  }
                } else {
                  remainingTime = timeText
                }
              } else if (data.estimated_time_minutes) {
                // estimated_time_minutes가 있으면 그것 사용
                const totalSeconds = Math.floor(data.estimated_time_minutes * 60)
                const minutes = Math.floor(totalSeconds / 60)
                const seconds = totalSeconds % 60
                if (minutes > 0) {
                  remainingTime = `${minutes}분 ${seconds}초`
                } else {
                  remainingTime = `${seconds}초`
                }
              }
              
              setTrainProgress({ progress, message, remainingTime })
              
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
              setTrainProgress(prev => ({ ...prev, progress: 0, message: '시작 대기 중...', remainingTime: null }))
            } else {
              // progress가 직접 있는 경우
              const progress = typeof data.progress === 'number' ? data.progress : 0
              const message = data.message || '진행 중...'
              setTrainProgress(prev => ({ ...prev, progress, message }))
              
              if (progress >= 100) {
                setTraining(false)
                setStatusMessage({ type: 'success', text: '모델 학습이 완료되었습니다.' })
              }
            }
          } else {
            // 응답이 실패한 경우에도 프로그레스바 유지
            const errorData = await res.json().catch(() => ({ error: '진행률 조회 실패' }))
            console.error('진행률 조회 실패:', errorData)
            setTrainProgress(prev => ({ 
              progress: prev.progress || 0, 
              message: prev.message || '시작 대기 중...' 
            }))
            // 학습 상태는 유지 (사용자가 확인할 수 있도록)
          }
        } catch (error) {
          console.error('진행률 조회 실패:', error)
          // 네트워크 오류 등으로 조회 실패해도 프로그레스바는 유지
          setTrainProgress(prev => ({ 
            progress: prev.progress || 0, 
            message: prev.message || '시작 대기 중...' 
          }))
        }
      } else {
        // 학습이 시작되었지만 진행률 조회가 안 되는 경우에도 프로그레스바 유지
        if (training) {
          setTrainProgress(prev => ({
            progress: prev.progress || 0,
            message: prev.message || '시작 대기 중...',
            remainingTime: prev.remainingTime || null
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
          setAugmentTempCompleted(false)
        } else {
          setAugmentedTemp({
            timestamps: tempData.timestamps || [],
            values: tempData.values || []
          })
          // 증강 데이터가 있으면 완료 상태로 표시
          if (tempData.timestamps && tempData.timestamps.length > 0) {
            setAugmentTempCompleted(true)
          }
        }
      } else {
        const errorData = await tempRes.json().catch(() => ({}))
        setError(errorData.error || '증강 데이터를 가져올 수 없습니다')
        setAugmentTempCompleted(false)
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
          // 증강 데이터가 있으면 완료 상태로 표시
          if (vibData.timestamps && vibData.timestamps.length > 0) {
            setAugmentVibCompleted(true)
          }
        } else {
          setAugmentVibCompleted(false)
        }
      } else {
        setAugmentVibCompleted(false)
      }
    } catch (error) {
      console.error('증강 데이터 가져오기 실패:', error)
      setError('데이터를 불러오는 중 오류가 발생했습니다')
      setAugmentTempCompleted(false)
      setAugmentVibCompleted(false)
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
    setError(null) // 에러 초기화
    try {
      const response = await fetch('/api/ai/predict')
      if (response.ok) {
        const data = await response.json()
        // 예측 결과에 error가 있으면 에러로 처리
        if (data.error) {
          console.error('예측 결과 오류:', data.error)
          setError(data.error)
          setPrediction(null)
        } else {
          setPrediction(data)
          setError(null)
        }
        setLoading(false)
      } else if (response.status === 503) {
        // 학습 중이거나 서비스 사용 불가
        const data = await response.json().catch(() => ({}))
        const errorMsg = data.message || data.error || '예측을 수행할 수 없습니다 (학습 중 또는 서비스 사용 불가)'
        console.log('예측 불가 (학습 중 또는 모델 없음):', errorMsg)
        setError(errorMsg)
        setPrediction(null)
        setLoading(false)
      } else if (response.status === 404) {
        // 모델이 없음
        const data = await response.json().catch(() => ({}))
        const errorMsg = data.error || '학습된 모델이 없습니다. 먼저 모델 학습을 완료해주세요.'
        console.log('모델 없음:', errorMsg)
        setError(errorMsg)
        setPrediction(null)
        setLoading(false)
      } else {
        const data = await response.json().catch(() => ({ error: '예측 실패' }))
        console.error('예측 실패:', data.error)
        setError(data.error || '예측을 수행할 수 없습니다')
        setPrediction(null)
        setLoading(false)
      }
    } catch (error) {
      console.error('예측 데이터 가져오기 실패:', error)
      setError('예측 데이터를 가져오는 중 오류가 발생했습니다: ' + error.message)
      setPrediction(null)
      setLoading(false)
    }
  }

  // 증강 데이터 업데이트 (온도+진동 통합)
  const handleAugment = async () => {
    if (augmenting) return
    
    setAugmenting(true)
    setAugmentTempCompleted(false)
    setAugmentVibCompleted(false)
    setStatusMessage(null)
    setAugmentProgress({ progress: 0, message: '증강 데이터 업데이트 시작 중...' })
    
    try {
      // 온도와 진동 증강을 동시에 시작
      const [tempRes, vibRes] = await Promise.all([
        fetch('/api/ai/augment/temperature', { method: 'POST' }),
        fetch('/api/ai/augment/vibration', { method: 'POST' })
      ])
      
      const tempData = await tempRes.json()
      const vibData = await vibRes.json()
      
      if (tempRes.ok && vibRes.ok) {
        // 성공 - 진행률은 useEffect에서 처리
        setStatusMessage({ type: 'success', text: '증강 데이터 업데이트가 시작되었습니다.' })
      } else {
        const errors = []
        if (!tempRes.ok) errors.push(`온도: ${tempData.error || '실패'}`)
        if (!vibRes.ok) errors.push(`진동: ${vibData.error || '실패'}`)
        setStatusMessage({ type: 'error', text: `증강 실패: ${errors.join(', ')}` })
        setAugmentProgress({ progress: 0, message: `오류: ${errors.join(', ')}` })
        setTimeout(() => {
          setAugmenting(false)
        }, 5000)
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: '증강 데이터 업데이트 중 오류가 발생했습니다.' })
      console.error('증강 실패:', error)
      setAugmentProgress({ progress: 0, message: '연결 오류가 발생했습니다.' })
      setTimeout(() => {
        setAugmenting(false)
      }, 5000)
    }
  }


  const handleTrain = async () => {
    // 체크박스 상태에 따라 학습에 사용할 데이터 소스 결정
    // 원본이 체크되어 있으면 원본 사용, 아니면 증강 사용
    const useOriginalTempForTrain = showOriginalTemp
    const useOriginalVibForTrain = showOriginalVib
    
    // 온도와 진동 중 하나라도 선택되어 있어야 학습 가능
    const hasTempData = showAugmentedTemp || showOriginalTemp
    const hasVibData = showAugmentedVib || showOriginalVib
    
    if (!hasTempData || !hasVibData) {
      setStatusMessage({ 
        type: 'error', 
        text: '온도와 진동 데이터를 모두 선택해주세요. (증강온도/원본온도 중 하나, 증강진동/원본진동 중 하나)' 
      })
      return
    }
    
    setTraining(true)
    setStatusMessage(null)
    setTrainProgress({ progress: 0, message: '시작 중...', remainingTime: null })
    
    // 학습에 사용할 데이터 소스를 예측용 상태에도 반영 (예측 시 동일한 데이터 소스 사용)
    setUseOriginalTemp(useOriginalTempForTrain)
    setUseOriginalVib(useOriginalVibForTrain)
    
    try {
      const response = await fetch('/api/ai/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          model_type: selectedModel,
          use_original_temp: useOriginalTempForTrain,
          use_original_vib: useOriginalVibForTrain
        })
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
        setTrainProgress({ progress: 0, message: '', remainingTime: null })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: '모델 학습 중 오류가 발생했습니다.' })
      console.error('모델 학습 실패:', error)
      setTraining(false)
      setTrainProgress({ progress: 0, message: '', remainingTime: null })
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

  const handleStopAugment = async () => {
    try {
      const response = await fetch('/api/ai/augment/stop', {
        method: 'POST'
      })
      const data = await response.json()
      
      if (response.ok) {
        setStatusMessage({ type: 'success', text: data.message || '증강이 중지되었습니다.' })
        setAugmenting(false)
        setAugmentProgress({ progress: 0, message: '증강이 중지되었습니다.' })
      } else {
        setStatusMessage({ type: 'error', text: data.error || '증강 중지 실패' })
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: '증강 중지 중 오류가 발생했습니다.' })
      console.error('증강 중지 실패:', error)
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

  // 패널 설정 (체크박스 상태에 따라 동적으로 생성)
  const panelConfigs = useMemo(() => {
    const configs = []
    if (showAugmentedTemp || showOriginalTemp) {
      configs.push({ id: 'temp-panel', size: 6, type: showOriginalTemp ? 'original' : 'augmented' })
    }
    if (showAugmentedVib || showOriginalVib) {
      configs.push({ id: 'vib-panel', size: 6, type: showOriginalVib ? 'original' : 'augmented' })
    }
    return configs
  }, [showAugmentedTemp, showAugmentedVib, showOriginalTemp, showOriginalVib])
  
  // 패널 순서 업데이트 (패널 개수에 맞게)
  useEffect(() => {
    const newOrder = panelConfigs.map((_, index) => index)
    setPanelOrder(newOrder)
  }, [panelConfigs.length])

  // 증강 온도 차트 데이터 메모이제이션
  const augmentedTempChartData = useMemo(() => {
    if (!augmentedTemp || !augmentedTemp.timestamps || augmentedTemp.timestamps.length === 0) return null
    return {
      labels: augmentedTemp.timestamps.map(ts => {
        const date = new Date(ts)
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      }),
      timestamps: augmentedTemp.timestamps,
      datasets: [{
        label: 'Augmented Temperature',
        data: augmentedTemp.values || [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)'
      }]
    }
  }, [augmentedTemp, selectedRange])

  // 원본 온도 차트 데이터 메모이제이션
  const originalTempChartData = useMemo(() => {
    if (!originalTemp || !originalTemp.timestamps || originalTemp.timestamps.length === 0) return null
    return {
      labels: originalTemp.timestamps.map(ts => {
        const date = new Date(ts)
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      }),
      timestamps: originalTemp.timestamps,
      datasets: [{
        label: 'Original Temperature',
        data: originalTemp.values || [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)'
      }]
    }
  }, [originalTemp, selectedRange])
  
  // 차트 옵션도 메모이제이션 (센서 탭과 동일한 스타일)
  const DEFAULT_PANEL_GRID = {
    left: '25px',
    right: '25px',
    bottom: '10px',
    top: '10%'
  }
  
  const tempChartOptions = useMemo(() => ({
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

  // 증강 진동 차트 데이터 메모이제이션
  const augmentedVibChartData = useMemo(() => {
    if (!augmentedVib || !augmentedVib.timestamps || augmentedVib.timestamps.length === 0) return null
    
    const prefix = 'Augmented'
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
          label: `${prefix} v-RMS (mm/s)`,
          data: (augmentedVib.v_rms || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.2)'
        },
        {
          label: `${prefix} a-Peak (m/s²)`,
          data: (augmentedVib.a_peak || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#f093fb',
          backgroundColor: 'rgba(240, 147, 251, 0.2)'
        },
        {
          label: `${prefix} a-RMS (m/s²)`,
          data: (augmentedVib.a_rms || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#11998e',
          backgroundColor: 'rgba(17, 153, 142, 0.2)'
        },
        {
          label: `${prefix} Crest`,
          data: (augmentedVib.crest || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#ffa500',
          backgroundColor: 'rgba(255, 165, 0, 0.2)'
        }
      ]
    }
  }, [augmentedVib, selectedRange])

  // 원본 진동 차트 데이터 메모이제이션
  const originalVibChartData = useMemo(() => {
    if (!originalVib || !originalVib.timestamps || originalVib.timestamps.length === 0) return null
    
    const prefix = 'Original'
    return {
      labels: originalVib.timestamps.map(ts => {
        const date = new Date(ts)
        if (selectedRange === '7d') {
          return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + 
                 date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        } else {
          return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        }
      }),
      timestamps: originalVib.timestamps,
      datasets: [
        {
          label: `${prefix} v-RMS (mm/s)`,
          data: (originalVib.v_rms || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.2)'
        },
        {
          label: `${prefix} a-Peak (m/s²)`,
          data: (originalVib.a_peak || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#f093fb',
          backgroundColor: 'rgba(240, 147, 251, 0.2)'
        },
        {
          label: `${prefix} a-RMS (m/s²)`,
          data: (originalVib.a_rms || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#11998e',
          backgroundColor: 'rgba(17, 153, 142, 0.2)'
        },
        {
          label: `${prefix} Crest`,
          data: (originalVib.crest || []).map(val => val !== null && val !== undefined ? val : null),
          borderColor: '#ffa500',
          backgroundColor: 'rgba(255, 165, 0, 0.2)'
        }
      ]
    }
  }, [originalVib, selectedRange])
  
  // 진동 데이터 차트 옵션 메모이제이션
  const vibChartOptions = useMemo(() => ({
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
        {/* 액션 버튼 및 체크박스 */}
        <div className="action-buttons">
          {/* 첫 번째 줄: 체크박스들 + 증강 데이터 업데이트 */}
          <div className="action-group checkbox-group">
            <label className={`checkbox-label ${showAugmentedTemp ? 'checked' : ''}`}>
              <input 
                type="checkbox"
                checked={showAugmentedTemp}
                onChange={(e) => {
                  setShowAugmentedTemp(e.target.checked)
                  if (e.target.checked && augmentedTemp.timestamps.length === 0) {
                    fetchAugmentedData()
                  }
                }}
              />
              <span>증강온도</span>
            </label>
            <label className={`checkbox-label ${showAugmentedVib ? 'checked' : ''}`}>
              <input 
                type="checkbox"
                checked={showAugmentedVib}
                onChange={(e) => {
                  setShowAugmentedVib(e.target.checked)
                  if (e.target.checked && augmentedVib.timestamps.length === 0) {
                    fetchAugmentedData()
                  }
                }}
              />
              <span>증강진동</span>
            </label>
            <label className={`checkbox-label ${showOriginalTemp ? 'checked' : ''}`}>
              <input 
                type="checkbox"
                checked={showOriginalTemp}
                onChange={(e) => {
                  setShowOriginalTemp(e.target.checked)
                  if (e.target.checked) {
                    fetchOriginalTemp(true)
                  }
                }}
              />
              <span>원본온도</span>
            </label>
            <label className={`checkbox-label ${showOriginalVib ? 'checked' : ''}`}>
              <input 
                type="checkbox"
                checked={showOriginalVib}
                onChange={(e) => {
                  setShowOriginalVib(e.target.checked)
                  if (e.target.checked) {
                    fetchOriginalVib(true)
                  }
                }}
              />
              <span>원본진동</span>
            </label>
            <button 
              className="action-btn augment-btn"
              onClick={handleAugment}
              disabled={augmenting}
            >
              증강 데이터 업데이트
            </button>
            {augmenting && (
              <button 
                className="action-btn stop-btn" 
                onClick={handleStopAugment}
              >
                증강 중지
              </button>
            )}
          </div>
        </div>
        
        {/* 두 번째 줄: 모델 선택 + 모델 학습 */}
        <div className="action-buttons">
          <div className="action-group">
            <select 
              className="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={training}
            >
              <option value="lstm">LSTM - 시계열 장기 의존성 학습</option>
              <option value="gru">GRU - 경량화된 시계열 모델</option>
              <option value="transformer">Transformer - 상관관계 분석 특화</option>
            </select>
            <button 
              className="action-btn train-btn" 
              onClick={handleTrain}
              disabled={training}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ marginRight: '6px' }}>
                <path d="M3 2L11 7L3 12V2Z" />
              </svg>
              모델 학습
            </button>
            {training && (
              <button 
                className="action-btn stop-btn" 
                onClick={handleStopTrain}
              >
                중지
              </button>
            )}
          </div>
        </div>

        {/* 프로그레스바 - 공통 위치 */}
        {(augmenting || training) && (
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className={`progress-fill ${training ? 'train-fill' : ''}`}
                style={{ width: `${Math.max(0, Math.min(100, (augmenting ? augmentProgress.progress : trainProgress.progress) || 0))}%` }}
              ></div>
            </div>
            <div className="progress-text">
              {(() => {
                const progress = augmenting ? augmentProgress.progress : trainProgress.progress
                const message = augmenting ? augmentProgress.message : trainProgress.message
                const remainingTime = training ? trainProgress.remainingTime : null
                return (
                  <>
                    <div>{progress || 0}% - {message || '진행 중...'}</div>
                    {remainingTime && <div className="progress-time">남은시간: {remainingTime}</div>}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* 데이터 패널 그리드 - 체크박스 상태에 따라 표시 */}
        {(showAugmentedTemp || showAugmentedVib || showOriginalTemp || showOriginalVib) && (
          <div 
            ref={containerRef}
            className="dashboard-container"
            id="augmented-dashboard-container"
          >
            {panelOrder.map((orderIndex) => {
              const config = panelConfigs[orderIndex]
              if (!config) return null

              if (config.id === 'temp-panel') {
                const isOriginal = config.type === 'original'
                const chartData = isOriginal ? originalTempChartData : augmentedTempChartData

                return (
                  <div 
                    key="temp-panel"
                    className="panel" 
                    id="temp-panel"
                    data-panel-id="temp-panel"
                    style={{ gridColumn: `span ${config.size}` }}
                  >
                    <PanelHeader title={isOriginal ? "Original Temperature History" : "Augmented Temperature History"} showCsv={false} showExtension={false} />
                    <div className="panel-content">
                      {chartData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                          <Chart
                            key={`temp-${selectedRange}-${isOriginal ? 'original' : 'augmented'}`}
                            type="line"
                            data={chartData}
                            options={tempChartOptions}
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
              } else if (config.id === 'vib-panel') {
                const isOriginal = config.type === 'original'
                const chartData = isOriginal ? originalVibChartData : augmentedVibChartData

                return (
                  <div 
                    key="vib-panel"
                    className="panel" 
                    id="vib-panel"
                    data-panel-id="vib-panel"
                    style={{ gridColumn: `span ${config.size}` }}
                  >
                    <PanelHeader title={isOriginal ? "Original Vibration History" : "Augmented Vibration History"} showCsv={false} showExtension={false} />
                    <div className="panel-content">
                      {chartData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                          <Chart
                            key={`vib-${selectedRange}-${isOriginal ? 'original' : 'augmented'}`}
                            type="line"
                            data={chartData}
                            options={vibChartOptions}
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
        )}

        {/* 예측 결과 패널 - 그래프 아래에 표시 */}
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
                <span className="label">예측 {prediction.vibration_field_name || '진동'}:</span>
                <span className="value">{prediction.prediction?.predicted_vibration?.toFixed(2)}</span>
              </div>
              <div className="prediction-item">
                <span className="label">실제 {prediction.vibration_field_name || '진동'}:</span>
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

        {loading && !prediction && <div className="loading">예측 중...</div>}

        {/* 예측 오류 메시지 */}
        {error && !loading && (
          <div className="error-message">
            <h3>⚠️ 예측 오류</h3>
            <p>{error}</p>
            {error.includes('모델이 없습니다') && (
              <div className="setup-instructions">
                <p>모델 학습을 완료해주세요:</p>
                <ol>
                  <li>데이터 증강이 완료되었는지 확인하세요</li>
                  <li>모델 타입을 선택하고 "모델 학습" 버튼을 클릭하세요</li>
                  <li>학습이 완료되면 예측 결과가 자동으로 표시됩니다</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* 데이터가 없을 때 안내 메시지 */}
        {!error && !loading && !prediction && 
         !showAugmentedTemp && !showAugmentedVib && !showOriginalTemp && !showOriginalVib && (
          <div className="no-data-message">
            <h3>📊 그래프 표시</h3>
            <p>위의 체크박스를 선택하여 그래프를 표시하세요.</p>
            <p>• 증강온도/증강진동: 증강 데이터 업데이트 버튼을 먼저 실행하세요</p>
            <p>• 원본온도/원본진동: 체크박스를 선택하면 자동으로 불러옵니다</p>
          </div>
        )}
      </div>
      
      {/* 상태 메시지 토스트 알림 - 화면 하단 오른쪽 */}
      {statusMessage && (
        <div className={`status-message-toast ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}
    </div>
  )
}

export default AIPrediction
