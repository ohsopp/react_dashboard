import SensorInfo from '../SensorInfo/SensorInfo'
import './SensorInformation.css'

const SensorInformation = () => {
  return (
    <div className="sensor-information">
      <div className="sensor-information-content">
        <SensorInfo ports={["1", "2"]} showMasterInfo={true} />
      </div>
    </div>
  )
}

export default SensorInformation
