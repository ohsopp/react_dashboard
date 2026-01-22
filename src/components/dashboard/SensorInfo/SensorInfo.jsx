import { useState, useEffect } from 'react'
import './SensorInfo.css'
import al1326Image from '../../../assets/images/AL1326.png'
import vvb001Image from '../../../assets/images/VVB001.png'
import tp3237Image from '../../../assets/images/TP3237.png'

const SensorInfo = ({ port, ports, showMasterInfo = true }) => {
  // ports 배열이 제공되면 사용, 없으면 port 단일 값 사용
  const portList = ports || (port ? [port] : ['2'])
  
  // 에러가 발생해도 컴포넌트가 크래시되지 않도록 에러 상태 관리
  const [componentError, setComponentError] = useState(null)
  
  const [masterInfo, setMasterInfo] = useState({
    connected: false,
    model_name: null,
    firmware_version: null,
    ip_address: null,
    port_count: null,
    error: null
  })
  
  // 여러 포트의 디바이스 정보를 저장
  const [devicesInfo, setDevicesInfo] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMasterInfo = async () => {
      try {
        const response = await fetch('/api/iolink/master/info')
        const text = await response.text()
        if (!text || text.trim() === '') {
          setMasterInfo(prev => ({ ...prev, error: '서버에서 응답이 없습니다.', connected: false }))
          return
        }
        
        let data
        try {
          data = JSON.parse(text)
        } catch (parseError) {
          setMasterInfo(prev => ({ ...prev, error: `응답 파싱 실패`, connected: false }))
          return
        }
        
        if (response.ok) {
          setMasterInfo(data)
        } else {
          setMasterInfo({ ...data, error: data.error || '정보를 가져올 수 없습니다.' })
        }
      } catch (error) {
        console.error('IO-Link Master 정보 가져오기 실패:', error)
        setMasterInfo(prev => ({ ...prev, error: `연결 실패: ${error.message || '알 수 없는 오류'}`, connected: false }))
      }
    }
    
    const fetchDevicesInfo = async (isInitialLoad = false) => {
      try {
        if (isInitialLoad) {
          setLoading(true)
        }
        const devicesData = {}
        
        // 모든 포트의 정보를 가져오기
        for (const portNum of portList) {
          try {
            const response = await fetch(`/api/iolink/device/info?port=${portNum}`)
            const text = await response.text()
            
            if (!text || text.trim() === '') {
              devicesData[portNum] = {
                error: '서버에서 응답이 없습니다.',
                connected: false
              }
              continue
            }
            
            let data
            try {
              data = JSON.parse(text)
            } catch (parseError) {
              devicesData[portNum] = {
                error: `응답 파싱 실패`,
                connected: false
              }
              continue
            }
            
            if (response.ok) {
              devicesData[portNum] = data
            } else {
              devicesData[portNum] = {
                ...data,
                error: data.error || '정보를 가져올 수 없습니다.'
              }
            }
          } catch (error) {
            console.error(`포트 ${portNum} 센서 정보 가져오기 실패:`, error)
            devicesData[portNum] = {
              error: `연결 실패: ${error.message || '알 수 없는 오류'}`,
              connected: false
            }
          }
        }
        
        setDevicesInfo(devicesData)
      } catch (error) {
        console.error('센서 정보 가져오기 실패:', error)
      } finally {
        if (isInitialLoad) {
          setLoading(false)
        }
      }
    }

    if (showMasterInfo) {
      fetchMasterInfo().catch(err => {
        console.error('IO-Link Master 정보 초기 로드 실패:', err)
      })
    }
    
    fetchDevicesInfo(true).catch(err => {
      console.error('센서 정보 초기 로드 실패:', err)
      setComponentError(err)
    })
    
    // 30초마다 정보 업데이트 (에러가 발생해도 계속 시도)
    const interval = setInterval(() => {
      if (showMasterInfo) {
        fetchMasterInfo().catch(err => {
          console.error('IO-Link Master 정보 업데이트 실패:', err)
        })
      }
      fetchDevicesInfo(false).catch(err => {
        console.error('센서 정보 업데이트 실패:', err)
      })
    }, 30000)
    
    return () => clearInterval(interval)
  }, [portList.join(','), showMasterInfo])

  if (loading) {
    return (
      <div className="sensor-info">
        <div className="sensor-info-loading">센서 정보를 불러오는 중...</div>
      </div>
    )
  }

  // 모든 포트가 연결되지 않았는지 확인
  const allDisconnected = portList.every(portNum => 
    !devicesInfo[portNum]?.connected && !devicesInfo[portNum]?.error
  )
  
  if (allDisconnected && Object.keys(devicesInfo).length === portList.length) {
    return (
      <div className="sensor-info">
        <div className="sensor-info-disconnected">센서가 연결되지 않았습니다.</div>
      </div>
    )
  }

  // 이미지 매핑 함수
  const getImageForDevice = (productName, deviceName, portNum) => {
    if (!productName && !deviceName) {
      // 포트 번호에 따라 기본 이미지 반환
      if (portNum === '1') return vvb001Image
      if (portNum === '2') return tp3237Image
      return null
    }
    
    const name = productName || deviceName || ''
    const modelMatch = name.match(/^([A-Z0-9]+)/)
    const modelNumber = modelMatch ? modelMatch[1] : name.split(' ')[0]
    
    if (modelNumber.includes('AL1326')) return al1326Image
    if (modelNumber.includes('VVB001')) return vvb001Image
    if (modelNumber.includes('TP3237')) return tp3237Image
    
    // 포트 번호에 따라 기본 이미지 반환
    if (portNum === '1') return vvb001Image
    if (portNum === '2') return tp3237Image
    
    return null
  }

  return (
    <div className="sensor-info">
      <div className="sensor-info-container">
        {/* IO-Link Master 정보 */}
        {showMasterInfo && (
          <div className="sensor-info-section">
            <div className="sensor-info-section-title master-title">IO-Link Master</div>
            <div className="sensor-info-section-content">
              <div className="sensor-info-image-wrapper">
                <img 
                  src={al1326Image} 
                  alt="IO-Link Master" 
                  className="sensor-info-product-image"
                />
              </div>
              <div className="sensor-info-details">
                {masterInfo.error && (
                  <div className="sensor-info-error">
                    <span className="sensor-info-label">오류:</span>
                    <span className="sensor-info-value" style={{ fontSize: '13px', wordBreak: 'break-word' }}>{masterInfo.error}</span>
                  </div>
                )}
                {masterInfo.connected && (
                  <>
                    {masterInfo.model_name && (
                      <div className="sensor-info-row">
                        <span className="sensor-info-label">모델명:</span>
                        <span className="sensor-info-value">{masterInfo.model_name}</span>
                      </div>
                    )}
                    {masterInfo.firmware_version && (
                      <div className="sensor-info-row">
                        <span className="sensor-info-label">펌웨어 버전:</span>
                        <span className="sensor-info-value">{masterInfo.firmware_version}</span>
                      </div>
                    )}
                    {masterInfo.ip_address && (
                      <div className="sensor-info-row">
                        <span className="sensor-info-label">IP 주소:</span>
                        <span className="sensor-info-value">{masterInfo.ip_address}</span>
                      </div>
                    )}
                    {masterInfo.port_count && (
                      <div className="sensor-info-row">
                        <span className="sensor-info-label">포트 수:</span>
                        <span className="sensor-info-value">{masterInfo.port_count}</span>
                      </div>
                    )}
                    {/* IO-Link Master 제품 정보 링크 */}
                    {masterInfo.model_name && (
                      <div className="sensor-info-row">
                        <span className="sensor-info-label">제품 정보:</span>
                        <span className="sensor-info-value">
                          <a 
                            href={`https://www.ifm.com/kr/ko/product/${masterInfo.model_name}#documents`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="sensor-info-link"
                          >
                            보기
                          </a>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* 센서 디바이스 정보 */}
        {portList.map(portNum => {
          const deviceInfo = devicesInfo[portNum] || {}
          const productImage = getImageForDevice(deviceInfo.product_name, deviceInfo.device_name, portNum)
          
          return (
            <div key={portNum} className="sensor-info-section">
              <div className="sensor-info-section-title device-title">포트 {portNum}</div>
              <div className="sensor-info-section-content">
                {productImage && (
                  <div className="sensor-info-image-wrapper">
                    <img 
                      src={productImage} 
                      alt={`포트 ${portNum} 센서`} 
                      className="sensor-info-product-image"
                    />
                  </div>
                )}
                <div className="sensor-info-details">
                  {deviceInfo.error && (
                    <div className="sensor-info-error">
                      <span className="sensor-info-label">오류:</span>
                      <span className="sensor-info-value" style={{ fontSize: '13px', wordBreak: 'break-word' }}>{deviceInfo.error}</span>
                    </div>
                  )}
                  {deviceInfo.connected && (
                    <>
                      {/* 디바이스명과 제품명이 같으면 하나만 표시 */}
                      {deviceInfo.device_name && deviceInfo.product_name && deviceInfo.device_name === deviceInfo.product_name ? (
                        <div className="sensor-info-row">
                          <span className="sensor-info-label">제품명:</span>
                          <span className="sensor-info-value">{deviceInfo.product_name}</span>
                        </div>
                      ) : (
                        <>
                          {deviceInfo.device_name && (
                            <div className="sensor-info-row">
                              <span className="sensor-info-label">디바이스명:</span>
                              <span className="sensor-info-value">{deviceInfo.device_name}</span>
                            </div>
                          )}
                          {deviceInfo.product_name && (
                            <div className="sensor-info-row">
                              <span className="sensor-info-label">제품명:</span>
                              <span className="sensor-info-value">{deviceInfo.product_name}</span>
                            </div>
                          )}
                        </>
                      )}
                      {/* 센서 디바이스의 펌웨어 버전은 표시하지 않음 (IO-Link Master 펌웨어와 혼동 방지) */}
                      {deviceInfo.device_id && (
                        <div className="sensor-info-row">
                          <span className="sensor-info-label">디바이스 ID:</span>
                          <span className="sensor-info-value">{deviceInfo.device_id}</span>
                        </div>
                      )}
                      {deviceInfo.vendor_id && (
                        <div className="sensor-info-row">
                          <span className="sensor-info-label">벤더 ID:</span>
                          <span className="sensor-info-value">{deviceInfo.vendor_id}</span>
                        </div>
                      )}
                      {deviceInfo.serial_number && (
                        <div className="sensor-info-row">
                          <span className="sensor-info-label">시리얼 번호:</span>
                          <span className="sensor-info-value">{deviceInfo.serial_number}</span>
                        </div>
                      )}
                      {/* 문서 다운로드 링크 */}
                      {(deviceInfo.product_name || deviceInfo.device_name) && (() => {
                        // 제품명에서 모델 번호 추출 (예: "VVB001 Status B" -> "VVB001")
                        const productName = deviceInfo.product_name || deviceInfo.device_name || ''
                        const modelMatch = productName.match(/^([A-Z0-9]+)/)
                        const modelNumber = modelMatch ? modelMatch[1] : productName.split(' ')[0]
                        const documentUrl = `https://www.ifm.com/kr/ko/product/${modelNumber}#documents`
                        
                        return (
                          <div className="sensor-info-row">
                            <span className="sensor-info-label">제품 정보:</span>
                            <span className="sensor-info-value">
                              <a 
                                href={documentUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="sensor-info-link"
                              >
                                보기
                              </a>
                            </span>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SensorInfo
