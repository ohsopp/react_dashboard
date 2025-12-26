import React, { useRef, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import './Chart.css';

// Chart 컴포넌트
const Chart = ({ type = 'line', data, options, className = '', dataZoomStart, dataZoomEnd, onDataZoomChange, timeRange, value }) => {
  // 게이지 차트인 경우 별도 처리
  if (type === 'gauge') {
    const gaugeValue = value !== undefined && value !== null ? value : 0;
    
    const gaugeOptions = {
      backgroundColor: 'transparent',
      series: [
        {
          name: 'Temperature',
          type: 'gauge',
          radius: '65%',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 50,
          splitNumber: 10,
          axisLine: {
            lineStyle: {
              width: 15,
              color: [
                [0.3, '#58a6ff'],  // 0-15도: 파란색
                [0.6, '#58a6ff'],  // 15-30도: 파란색
                [0.8, '#ffa500'],  // 30-40도: 주황색
                [1, '#ff4444']     // 40-50도: 빨간색
              ]
            }
          },
          pointer: {
            itemStyle: {
              color: '#c9d1d9',
              shadowColor: 'rgba(0, 0, 0, 0.5)',
              shadowBlur: 10,
              shadowOffsetX: 2,
              shadowOffsetY: 2
            },
            width: 6,
            length: '60%'
          },
          axisTick: {
            distance: -25,
            length: 6,
            lineStyle: {
              color: '#c9d1d9',
              width: 2
            }
          },
          splitLine: {
            distance: -30,
            length: 12,
            lineStyle: {
              color: '#c9d1d9',
              width: 2
            }
          },
          axisLabel: {
            color: '#c9d1d9',
            fontSize: 11,
            distance: -18,
            formatter: function(value) {
              if (value === 0 || value === 50) {
                return value + '°C';
              }
              return value;
            }
          },
          detail: {
            valueAnimation: true,
            width: '50%',
            lineHeight: 18,
            borderRadius: 6,
            offsetCenter: [0, '15%'],
            fontSize: 24,
            fontWeight: 'bold',
            formatter: function(value) {
              return value.toFixed(1) + '°C';
            },
            color: '#c9d1d9',
            backgroundColor: 'rgba(13, 17, 23, 0.8)',
            borderColor: '#30363d',
            borderWidth: 2,
            padding: [8, 16]
          },
          data: [
            {
              value: gaugeValue,
              name: 'Temperature'
            }
          ],
          animationDuration: 1000,
          animationEasing: 'cubicOut'
        }
      ],
      tooltip: {
        formatter: '{a} <br/>{b} : {c}°C',
        backgroundColor: 'rgba(13, 17, 23, 0.9)',
        borderColor: '#30363d',
        borderWidth: 1,
        textStyle: {
          color: '#c9d1d9',
          fontSize: 12
        }
      },
      ...options
    };

    return (
      <div className={`chart chart-${type} ${className}`}>
        <ReactECharts
          option={gaugeOptions}
          style={{ width: '100%', height: '100%', minHeight: '300px' }}
          opts={{ renderer: 'svg' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    );
  }

  // 막대 그래프인 경우 별도 처리
  if (type === 'bar') {
    const xAxisData = [];
    const data1 = [];
    const data2 = [];
    
    for (let i = 0; i < 100; i++) {
      xAxisData.push('A' + i);
      data1.push((Math.sin(i / 5) * (i / 5 - 10) + i / 6) * 5);
      data2.push((Math.cos(i / 5) * (i / 5 - 10) + i / 6) * 5);
    }

    const barOptions = {
      backgroundColor: 'transparent',
      title: {
        text: 'Bar Animation Delay',
        left: 'center',
        textStyle: {
          color: '#c9d1d9',
          fontSize: 16
        }
      },
      legend: {
        data: ['bar', 'bar2'],
        textStyle: {
          color: '#c9d1d9',
          fontSize: 12
        },
        top: 30
      },
      toolbox: {
        feature: {
          magicType: {
            type: ['stack']
          },
          dataView: {},
          saveAsImage: {
            pixelRatio: 2
          }
        },
        iconStyle: {
          borderColor: '#c9d1d9'
        },
        emphasis: {
          iconStyle: {
            borderColor: '#58a6ff'
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(13, 17, 23, 0.9)',
        borderColor: '#30363d',
        borderWidth: 1,
        textStyle: {
          color: '#c9d1d9',
          fontSize: 12
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        data: xAxisData,
        splitLine: {
          show: false
        },
        axisLine: {
          lineStyle: {
            color: '#30363d'
          }
        },
        axisLabel: {
          color: '#7d8590',
          fontSize: 10
        }
      },
      yAxis: {
        axisLine: {
          lineStyle: {
            color: '#30363d'
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(214, 223, 233, 0.1)',
            type: 'dashed'
          }
        },
        axisLabel: {
          color: '#7d8590',
          fontSize: 10
        }
      },
      series: [
        {
          name: 'bar',
          type: 'bar',
          data: data1,
          itemStyle: {
            color: '#58a6ff'
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: '#79c0ff'
            }
          },
          animationDelay: function (idx) {
            return idx * 10;
          }
        },
        {
          name: 'bar2',
          type: 'bar',
          data: data2,
          itemStyle: {
            color: '#f85149'
          },
          emphasis: {
            focus: 'series',
            itemStyle: {
              color: '#ff6b6b'
            }
          },
          animationDelay: function (idx) {
            return idx * 10 + 100;
          }
        }
      ],
      animationEasing: 'elasticOut',
      animationDelayUpdate: function (idx) {
        return idx * 5;
      },
      ...options
    };

    return (
      <div className={`chart chart-${type} ${className}`}>
        <ReactECharts
          option={barOptions}
          style={{ width: '100%', height: '100%', minHeight: '300px' }}
          opts={{ renderer: 'svg' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    );
  }

  // 파이 차트의 경우 다른 데이터 구조 사용
  if (type === 'pie') {
    if (!data || !data.series || !data.series.data || data.series.data.length === 0) {
      return (
        <div className={`chart chart-${type} ${className}`}>
          <div className="chart-placeholder">
            데이터가 없습니다.
          </div>
        </div>
      );
    }
  } else {
    if (!data || !data.labels || !data.datasets || data.datasets.length === 0) {
      return (
        <div className={`chart chart-${type} ${className}`}>
          <div className="chart-placeholder">
            데이터가 없습니다.
          </div>
        </div>
      );
    }
  }

  // 파이 차트인 경우 별도 처리
  if (type === 'pie') {
    const pieData = data.series?.data || [];
    
    const pieOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(13, 17, 23, 0.9)',
        borderColor: '#30363d',
        borderWidth: 1,
        textStyle: {
          color: '#c9d1d9',
          fontSize: 12
        }
      },
      visualMap: {
        show: false,
        min: 80,
        max: 600,
        inRange: {
          colorLightness: [0, 1]
        }
      },
      series: [
        {
          name: data.series?.name || 'Access From',
          type: 'pie',
          radius: '70%',
          center: ['50%', '50%'],
          data: pieData.sort(function (a, b) {
            return a.value - b.value;
          }),
          roseType: 'radius',
          label: {
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: 12
          },
          labelLine: {
            lineStyle: {
              color: 'rgba(255, 255, 255, 0.6)'
            },
            smooth: 0.2,
            length: 10,
            length2: 20
          },
          itemStyle: {
            color: '#c23531',
            shadowBlur: 200,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          },
          animationType: 'scale',
          animationEasing: 'elasticOut',
          animationDelay: function (idx) {
            return Math.random() * 200;
          }
        }
      ],
      ...options
    };

    return (
      <div className={`chart chart-${type} ${className}`}>
        <ReactECharts
          option={pieOptions}
          style={{ width: '100%', height: '100%', minHeight: '300px' }}
          opts={{ renderer: 'svg' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    );
  }

  // ECharts 옵션 생성 (line 차트용)
  const dataset = data.datasets[0];
  
  // timeRange 변경 시 dataZoom 초기화를 위한 ref
  const previousTimeRangeRef = useRef(timeRange);
  
  // yAxis 범위 통일 (모든 시간 범위에서 동일한 고정 범위 사용)
  // 온도 데이터의 일반적인 범위를 고려하여 0도부터 50도까지 고정
  const yAxisMin = 0;
  const yAxisMax = 50;
  
  // 데이터가 충분한 경우 dataZoom 초기 범위 설정 (최근 20%만 표시)
  const dataLength = dataset.data.length;
  const initialEnd = dataLength > 10 ? 100 : 100; // 데이터가 많으면 최근 20%만 표시
  const initialStart = dataLength > 10 ? 80 : 0; // 최근 20%부터 시작
  
  // dataZoom 위치를 고정하기 위한 ref (props로 받은 값 사용)
  const dataZoomStateRef = useRef({ 
    start: dataZoomStart !== undefined ? dataZoomStart : initialStart, 
    end: dataZoomEnd !== undefined ? dataZoomEnd : initialEnd 
  });
  
  // timeRange가 변경되면 dataZoom 초기화 및 ECharts 옵션 리셋
  useEffect(() => {
    if (previousTimeRangeRef.current !== timeRange) {
      previousTimeRangeRef.current = timeRange;
      dataZoomStateRef.current.start = 0;
      dataZoomStateRef.current.end = 100;
      if (onDataZoomChange) {
        onDataZoomChange(0, 100);
      }
      
      // ECharts 인스턴스를 명시적으로 리셋하여 이전 범위의 yAxis가 남지 않도록 함
      if (chartRef.current && chartRef.current.getEchartsInstance) {
        setTimeout(() => {
          try {
            const echartsInstance = chartRef.current.getEchartsInstance();
            if (echartsInstance && (!echartsInstance.isDisposed || !echartsInstance.isDisposed())) {
              // yAxis를 명시적으로 리셋
              echartsInstance.setOption({
                yAxis: {
                  min: undefined,
                  max: undefined
                }
              }, { notMerge: false, lazyUpdate: false });
            }
          } catch (error) {
            console.warn('ECharts yAxis reset error:', error);
          }
        }, 50);
      }
    }
  }, [timeRange, onDataZoomChange]);
  
  // props가 변경되면 ref 업데이트
  useEffect(() => {
    if (dataZoomStart !== undefined && dataZoomEnd !== undefined) {
      dataZoomStateRef.current.start = dataZoomStart;
      dataZoomStateRef.current.end = dataZoomEnd;
    }
  }, [dataZoomStart, dataZoomEnd]);
  
  // echartsOption을 useMemo로 감싸서 데이터나 timeRange가 변경될 때만 재생성
  const echartsOption = useMemo(() => ({
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
      renderMode: 'richText', // richText 모드 사용 (HTML DOM 조작 최소화, innerHTML 오류 방지)
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
            return '데이터 없음'
          }
          const param = params[0]
          if (!param || param === null || param === undefined) {
            return '데이터 없음'
          }
          const name = param.name || param.axisValue || ''
          const seriesName = param.seriesName || 'Temperature'
          
          if (param.value === null || param.value === undefined || isNaN(param.value)) {
            return `${name}\n${seriesName}: --`
          }
          
          const value = Number(param.value)
          if (isNaN(value)) {
            return `${name}\n${seriesName}: --`
          }
          
          return `${name}\n${seriesName}: ${value.toFixed(1)}°C`
        } catch (error) {
          console.warn('Tooltip formatter error:', error)
          return '데이터 없음'
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
      min: yAxisMin, // 명시적인 값 사용 (함수 대신)
      max: yAxisMax, // 명시적인 값 사용 (함수 대신)
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
  }), [dataset.data, dataset.label, data.labels, dataZoomStart, dataZoomEnd, timeRange, yAxisMin, yAxisMax]); // 의존성 배열에 필요한 값들 추가

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

