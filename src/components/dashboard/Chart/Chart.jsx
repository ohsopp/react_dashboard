import React, { useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import './Chart.css';

// Chart 컴포넌트
const Chart = ({ type = 'line', data, options, className = '', dataZoomStart, dataZoomEnd, onDataZoomChange, timeRange }) => {
  if (!data || !data.labels || !data.datasets || data.datasets.length === 0) {
    return (
      <div className={`chart chart-${type} ${className}`}>
        <div className="chart-placeholder">
          데이터가 없습니다.
        </div>
      </div>
    );
  }

  // ECharts 옵션 생성
  const dataset = data.datasets[0];
  
  // 데이터가 충분한 경우 dataZoom 초기 범위 설정 (최근 20%만 표시)
  const dataLength = dataset.data.length;
  const initialEnd = dataLength > 10 ? 100 : 100; // 데이터가 많으면 최근 20%만 표시
  const initialStart = dataLength > 10 ? 80 : 0; // 최근 20%부터 시작
  
  // dataZoom 위치를 고정하기 위한 ref (props로 받은 값 사용)
  const dataZoomStateRef = useRef({ 
    start: dataZoomStart !== undefined ? dataZoomStart : initialStart, 
    end: dataZoomEnd !== undefined ? dataZoomEnd : initialEnd 
  });
  
  // props가 변경되면 ref 업데이트
  useEffect(() => {
    if (dataZoomStart !== undefined && dataZoomEnd !== undefined) {
      dataZoomStateRef.current.start = dataZoomStart;
      dataZoomStateRef.current.end = dataZoomEnd;
    }
  }, [dataZoomStart, dataZoomEnd]);
  
  const echartsOption = {
    animation: false, // 실시간 업데이트를 위해 애니메이션 비활성화
    grid: {
      left: 50,
      right: 30,
      top: 35, // 그래프 위쪽 여백 확보
      bottom: 100, // 슬라이더 높이를 위해 하단 여백 증가
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13, 17, 23, 0.9)',
      borderColor: '#30363d',
      borderWidth: 1,
      textStyle: {
        color: '#c9d1d9',
        fontSize: 12
      },
      confine: true, // tooltip이 차트 영역 내에 제한되도록
      appendToBody: false, // body에 append하지 않고 차트 내부에 유지
      renderMode: 'html', // HTML 렌더링 모드 사용
      axisPointer: {
        type: 'line',
        lineStyle: {
          color: '#58a6ff',
          width: 1,
          type: 'dashed'
        },
        label: {
          show: true,
          backgroundColor: 'rgba(13, 17, 23, 0.9)',
          borderColor: '#30363d',
          borderWidth: 1,
          color: '#c9d1d9',
          fontSize: 12
        }
      },
      formatter: function(params) {
        try {
          if (!params || !Array.isArray(params) || params.length === 0) {
            return '<div>데이터 없음</div>'
          }
          const param = params[0]
          if (!param || param === null || param === undefined) {
            return '<div>데이터 없음</div>'
          }
          const name = param.name || param.axisValue || ''
          const seriesName = param.seriesName || 'Temperature'
          
          if (param.value === null || param.value === undefined || isNaN(param.value)) {
            return `<div>${name}<br/>${seriesName}: --</div>`
          }
          
          const value = Number(param.value)
          if (isNaN(value)) {
            return `<div>${name}<br/>${seriesName}: --</div>`
          }
          
          return `<div>${name}<br/>${seriesName}: ${value.toFixed(1)}°C</div>`
        } catch (error) {
          console.warn('Tooltip formatter error:', error)
          return '<div>데이터 없음</div>'
        }
      },
      // tooltip이 표시되지 않을 때를 대비한 안전장치
      showDelay: 0,
      hideDelay: 0,
      enterable: false,
      // tooltip DOM이 준비되지 않았을 때를 대비
      alwaysShowContent: false
    },
    dataZoom: [
      {
        type: 'inside', // 내부 줌 (마우스 휠로 확대/축소)
        start: dataZoomStateRef.current.start,
        end: dataZoomStateRef.current.end,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      {
        type: 'slider', // 하단 슬라이더
        start: dataZoomStateRef.current.start,
        end: dataZoomStateRef.current.end,
        height: 35, // 슬라이더 높이 증가
        handleIcon: 'path://M30.9,53.2C16.8,53.2,5.3,41.7,5.3,27.6S16.8,2,30.9,2C45,2,56.4,13.5,56.4,27.6S45,53.2,30.9,53.2z M30.9,3.5C17.6,3.5,6.8,14.4,6.8,27.6c0,13.2,10.8,24.1,24.1,24.1C44.2,51.7,55,40.8,55,27.6C54.9,14.4,44.1,3.5,30.9,3.5z M36.9,35.8c0,0.6-0.4,1-1,1H26.8c-0.6,0-1-0.4-1-1V19.4c0-0.6,0.4-1,1-1h9.1c0.6,0,1,0.4,1,1V35.8z',
        handleSize: '80%',
        handleStyle: {
          color: '#58a6ff',
          borderColor: '#58a6ff'
        },
        textStyle: {
          color: '#7d8590',
          fontSize: 10
        },
        borderColor: '#30363d',
        fillerColor: 'rgba(88, 166, 255, 0.2)',
        dataBackground: {
          lineStyle: {
            color: '#58a6ff',
            width: 1
          },
          areaStyle: {
            color: 'rgba(88, 166, 255, 0.1)'
          }
        },
        selectedDataBackground: {
          lineStyle: {
            color: '#58a6ff',
            width: 2
          },
          areaStyle: {
            color: 'rgba(88, 166, 255, 0.3)'
          }
        }
      }
    ],
    xAxis: {
      type: 'category',
      data: data.labels,
      boundaryGap: false,
      axisLine: {
        show: true,
        lineStyle: {
          color: '#30363d',
          width: 1
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#7d8590',
        fontSize: 10,
        rotate: 0,
        interval: 'auto'
      }
    },
    yAxis: {
      type: 'value',
      name: 'Temperature (°C)',
      nameTextStyle: {
        color: '#7d8590',
        fontSize: 10
      },
      boundaryGap: [0, '10%'], // 상단에 10% 여유 공간
      scale: false,
      min: (value) => {
        const minValue = Math.min(...dataset.data);
        return Math.floor(minValue) - 2;
      },
      max: (value) => {
        const maxValue = Math.max(...dataset.data);
        return Math.ceil(maxValue) + 2;
      },
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(214, 223, 233, 0.2)',
          width: 1,
          type: 'solid'
        }
      },
      axisLabel: {
        color: '#7d8590',
        fontSize: 10,
        formatter: '{value}°C'
      }
    },
    series: [
      {
        name: dataset.label || 'Temperature',
        type: 'line',
        data: dataset.data,
        smooth: true,
        sampling: 'lttb', // 대용량 데이터를 위한 LTTB 샘플링
        symbol: 'none', // 심볼 숨김 (성능 향상)
        connectNulls: false, // null 값이 있으면 선을 끊어서 빈 공간으로 표시
        lineStyle: {
          color: dataset.borderColor || '#58a6ff',
          width: 1
        },
        itemStyle: {
          color: dataset.borderColor || '#58a6ff'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: dataset.backgroundColor || 'rgba(88, 166, 255, 0.4)'
              },
              {
                offset: 1,
                color: dataset.backgroundColor || 'rgba(88, 166, 255, 0.05)'
              }
            ]
          }
        },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 1.5
          }
        }
      }
    ],
    ...options // 추가 옵션 병합
  };

  // dataZoom 이벤트 핸들러 - 사용자가 슬라이더를 조작할 때 위치 저장 및 부모에 알림
  const onEvents = {
    dataZoom: (params) => {
      // props에서 업데이트 중이면 무시 (무한 루프 방지)
      if (isUpdatingFromProps.current) {
        return;
      }
      
      let newStart, newEnd;
      
      if (params.batch && params.batch.length > 0) {
        const zoom = params.batch[0];
        if (zoom.start !== undefined && zoom.end !== undefined) {
          newStart = zoom.start;
          newEnd = zoom.end;
          dataZoomStateRef.current.start = newStart;
          dataZoomStateRef.current.end = newEnd;
        }
      } else if (params.start !== undefined && params.end !== undefined) {
        newStart = params.start;
        newEnd = params.end;
        dataZoomStateRef.current.start = newStart;
        dataZoomStateRef.current.end = newEnd;
      }
      
      // 부모 컴포넌트에 변경사항 즉시 알림
      if (onDataZoomChange && newStart !== undefined && newEnd !== undefined) {
        onDataZoomChange(newStart, newEnd);
      }
    }
  };

  const chartRef = useRef(null);
  const isUpdatingFromProps = useRef(false);
  
  // props가 변경되면 차트에 즉시 반영
  useEffect(() => {
    // 다음 이벤트 루프에서 실행하여 ECharts 경고 방지
    const timer = setTimeout(() => {
      if (chartRef.current && chartRef.current.getEchartsInstance) {
        try {
          const echartsInstance = chartRef.current.getEchartsInstance();
          if (!echartsInstance) {
            return;
          }
          
          // isDisposed 체크 (ECharts 인스턴스가 파괴되었는지 확인)
          if (echartsInstance.isDisposed && echartsInstance.isDisposed()) {
            return;
          }
          
          if (dataZoomStart !== undefined && dataZoomEnd !== undefined) {
            // props에서 업데이트 중임을 표시 (이벤트 핸들러에서 무한 루프 방지)
            isUpdatingFromProps.current = true;
            
            try {
              // 현재 차트의 dataZoom 범위 확인
              const option = echartsInstance.getOption();
              if (option && option.dataZoom && option.dataZoom.length > 0) {
                const currentStart = option.dataZoom[0].start;
                const currentEnd = option.dataZoom[0].end;
                // props와 다를 때만 업데이트 (무한 루프 방지)
                if (Math.abs(currentStart - dataZoomStart) > 0.1 || Math.abs(currentEnd - dataZoomEnd) > 0.1) {
                  // requestAnimationFrame을 사용하여 더 안전하게 처리
                  requestAnimationFrame(() => {
                    try {
                      if (chartRef.current && chartRef.current.getEchartsInstance) {
                        const instance = chartRef.current.getEchartsInstance();
                        if (instance && (!instance.isDisposed || !instance.isDisposed())) {
                          instance.dispatchAction({
                            type: 'dataZoom',
                            start: dataZoomStart,
                            end: dataZoomEnd,
                            animation: false
                          });
                        }
                      }
                    } catch (error) {
                      console.warn('ECharts dispatchAction error:', error);
                    }
                  });
                }
              }
            } catch (error) {
              console.warn('ECharts option get error:', error);
            }
            
            // 다음 이벤트 루프에서 플래그 해제
            setTimeout(() => {
              isUpdatingFromProps.current = false;
            }, 0);
          }
        } catch (error) {
          console.warn('ECharts instance error:', error);
        }
      }
    }, 100); // 약간의 지연을 두어 DOM이 완전히 준비된 후 실행
    
    return () => clearTimeout(timer);
  }, [dataZoomStart, dataZoomEnd]);

  // 슬라이더 영역에서 이벤트 전파 방지
  const handleSliderInteraction = (e) => {
    // ECharts 슬라이더 영역인지 확인 (하단 100px 영역)
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const sliderAreaHeight = 100; // 슬라이더 영역 높이 (grid.bottom 값과 동일)
    
    // 슬라이더 영역에서 클릭한 경우에만 이벤트 전파 방지
    if (clickY >= rect.height - sliderAreaHeight) {
      e.stopPropagation();
    }
  };

  return (
    <div 
      className={`chart chart-${type} chart-container ${className}`}
      onMouseDown={handleSliderInteraction}
      onClick={handleSliderInteraction}
      onDragStart={handleSliderInteraction}
    >
      <ReactECharts
        ref={chartRef}
        option={echartsOption}
        style={{ width: '100%', height: '100%', minHeight: '300px' }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
        lazyUpdate={true}
        onEvents={onEvents}
      />
    </div>
  );
};

export default Chart;

