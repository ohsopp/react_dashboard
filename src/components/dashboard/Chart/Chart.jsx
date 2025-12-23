// Chart 컴포넌트
const Chart = ({ type = 'line', data, options, className = '' }) => {
  return (
    <div className={`chart chart-${type} ${className}`}>
      {/* 차트 라이브러리 연동 예정 */}
      <div className="chart-placeholder">
        Chart Component - {type}
      </div>
    </div>
  );
};

export default Chart;

