import React from 'react';
import ReactECharts from 'echarts-for-react';
import './Chart.css';

// Chart 컴포넌트
const Chart = ({ type = 'line', data, options, className = '' }) => {
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
  const echartsOption = {
    grid: {
      left: '10%',
      right: '5%',
      top: '10%',
      bottom: '15%',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: data.labels,
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        color: '#7d8590',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(214, 223, 233, 0.15)',
          width: 0.5
        }
      },
      axisLabel: {
        color: '#7d8590',
        fontSize: 10
      }
    },
    series: [
      {
        name: dataset.label || 'Value',
        type: type === 'line' ? 'line' : 'bar',
        data: dataset.data,
        smooth: type === 'line',
        lineStyle: {
          color: dataset.borderColor || '#58a6ff',
          width: 1.5
        },
        itemStyle: {
          color: dataset.borderColor || '#58a6ff'
        },
        areaStyle: type === 'line' ? {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: dataset.backgroundColor || 'rgba(88, 166, 255, 0.3)'
              },
              {
                offset: 1,
                color: dataset.backgroundColor || 'rgba(88, 166, 255, 0.05)'
              }
            ]
          }
        } : undefined,
        symbol: 'circle',
        symbolSize: 4,
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderColor: '#0d1117',
            borderWidth: 1
          }
        }
      }
    ],
    ...options // 추가 옵션 병합
  };

  return (
    <div className={`chart chart-${type} ${className}`}>
      <ReactECharts
        option={echartsOption}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
};

export default Chart;

