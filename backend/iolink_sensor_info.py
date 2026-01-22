"""
IO-Link Master 센서 정보 가져오기 모듈
"""
import requests
import re
import time

# 센서 디바이스 정보 저장 (MQTT에서 추출한 정보)
sensor_device_info = {
    'port': '2',
    'connected': False,
    'device_id': None,
    'vendor_id': None,
    'product_name': None,
    'serial_number': None,
    'firmware_version': None,
    'device_name': None,
    'last_updated': None
}

def extract_sensor_info_from_mqtt(data, payload, port='2'):
    """MQTT 메시지에서 센서 디바이스 정보 추출"""
    global sensor_device_info
    
    try:
        # 다양한 경로에서 센서 정보 찾기
        iolink_paths = [
            f'/iolinkmaster/port[{port}]/iolinkdevice/deviceid',
            f'/iolinkmaster/port[{port}]/iolinkdevice/vendorid',
            f'/iolinkmaster/port[{port}]/iolinkdevice/productname',
            f'/iolinkmaster/port[{port}]/iolinkdevice/serialnumber',
            f'/iolinkmaster/port[{port}]/iolinkdevice/firmwareversion',
            f'/iolinkmaster/port[{port}]/iolinkdevice/devicename',
            f'/iolinkmaster/port[{port}]/iolinkdevice/deviceID',
            f'/iolinkmaster/port[{port}]/iolinkdevice/vendorID',
            f'/iolinkmaster/port[{port}]/iolinkdevice/productName',
            f'/iolinkmaster/port[{port}]/iolinkdevice/serialNumber',
            f'/iolinkmaster/port[{port}]/iolinkdevice/firmwareVersion',
            f'/iolinkmaster/port[{port}]/iolinkdevice/deviceName',
        ]
        
        for info_path in iolink_paths:
            path_data = payload.get(info_path)
            if path_data:
                info_value = path_data.get('data') if isinstance(path_data, dict) else path_data
                if info_value:
                    if 'deviceid' in info_path.lower():
                        sensor_device_info['device_id'] = str(info_value)
                    elif 'vendorid' in info_path.lower():
                        sensor_device_info['vendor_id'] = str(info_value)
                    elif 'productname' in info_path.lower():
                        sensor_device_info['product_name'] = str(info_value)
                    elif 'serialnumber' in info_path.lower():
                        sensor_device_info['serial_number'] = str(info_value)
                    elif 'firmwareversion' in info_path.lower():
                        sensor_device_info['firmware_version'] = str(info_value)
                    elif 'devicename' in info_path.lower():
                        sensor_device_info['device_name'] = str(info_value)
        
        # payload의 최상위 레벨에서도 찾기
        for key in payload.keys():
            if isinstance(key, str):
                key_lower = key.lower()
                value = payload[key]
                if isinstance(value, dict):
                    value = value.get('data') or value.get('value') or value
                
                if 'deviceid' in key_lower or 'device_id' in key_lower:
                    if not sensor_device_info['device_id']:
                        sensor_device_info['device_id'] = str(value)
                elif 'vendorid' in key_lower or 'vendor_id' in key_lower:
                    if not sensor_device_info['vendor_id']:
                        sensor_device_info['vendor_id'] = str(value)
                elif 'productname' in key_lower or 'product_name' in key_lower:
                    if not sensor_device_info['product_name']:
                        sensor_device_info['product_name'] = str(value)
                elif 'serialnumber' in key_lower or 'serial_number' in key_lower:
                    if not sensor_device_info['serial_number']:
                        sensor_device_info['serial_number'] = str(value)
                elif 'firmwareversion' in key_lower or 'firmware_version' in key_lower:
                    if not sensor_device_info['firmware_version']:
                        sensor_device_info['firmware_version'] = str(value)
                elif 'devicename' in key_lower or 'device_name' in key_lower:
                    if not sensor_device_info['device_name']:
                        sensor_device_info['device_name'] = str(value)
        
        # data의 최상위 레벨에서도 찾기
        for key in data.keys():
            if isinstance(key, str):
                key_lower = key.lower()
                value = data[key]
                if 'deviceid' in key_lower or 'device_id' in key_lower:
                    if not sensor_device_info['device_id']:
                        sensor_device_info['device_id'] = str(value)
                elif 'vendorid' in key_lower or 'vendor_id' in key_lower:
                    if not sensor_device_info['vendor_id']:
                        sensor_device_info['vendor_id'] = str(value)
                elif 'productname' in key_lower or 'product_name' in key_lower:
                    if not sensor_device_info['product_name']:
                        sensor_device_info['product_name'] = str(value)
                elif 'serialnumber' in key_lower or 'serial_number' in key_lower:
                    if not sensor_device_info['serial_number']:
                        sensor_device_info['serial_number'] = str(value)
                elif 'firmwareversion' in key_lower or 'firmware_version' in key_lower:
                    if not sensor_device_info['firmware_version']:
                        sensor_device_info['firmware_version'] = str(value)
                elif 'devicename' in key_lower or 'device_name' in key_lower:
                    if not sensor_device_info['device_name']:
                        sensor_device_info['device_name'] = str(value)
        
        # 정보를 하나라도 가져왔으면 연결된 것으로 표시
        if any([sensor_device_info['device_id'], sensor_device_info['vendor_id'], 
                sensor_device_info['product_name'], sensor_device_info['serial_number'], 
                sensor_device_info['firmware_version']]):
            sensor_device_info['connected'] = True
            sensor_device_info['last_updated'] = time.time()
            sensor_device_info['port'] = port
    except Exception:
        pass

def get_sensor_info_from_html(iolink_ip, port='2'):
    """IO-Link Master 웹 인터페이스 HTML에서 센서 정보 파싱"""
    base_url = f'http://{iolink_ip}'
    
    device_info = {
        'port': port,
        'connected': False,
        'device_id': None,
        'vendor_id': None,
        'product_name': None,
        'serial_number': None,
        'firmware_version': None,
        'device_name': None,
        'error': None,
        'source': 'html'
    }
    
    try:
        response = requests.get(base_url, timeout=3)
        
        if response.status_code == 200:
            html_content = response.text
            port_num = int(port)
            
            # HTML 테이블에서 포트별 센서 정보 파싱
            # 테이블 구조: Port | Mode | Comm. Mode | MasterCycleTime | Vendor ID | Device ID | Name | Serial
            pattern = rf'<tr><td>{port_num}</td>.*?<td[^>]*>([^<]*)</td>.*?<td[^>]*>([^<]*)</td>.*?<td[^>]*>([^<]*)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>([^<]*)</td>'
            match = re.search(pattern, html_content, re.DOTALL)
            
            if match:
                device_info['connected'] = True
                # 매칭된 그룹: Mode(1), Comm. Mode(2), MasterCycleTime(3), Vendor ID(4), Device ID(5), Name(6), Serial(7)
                vendor_id = re.sub(r'<[^>]+>', '', match.group(4)).strip()
                device_id = re.sub(r'<[^>]+>', '', match.group(5)).strip()
                device_name = re.sub(r'<[^>]+>', '', match.group(6)).strip()
                serial_number = re.sub(r'<[^>]+>', '', match.group(7)).strip()
                
                if vendor_id:
                    device_info['vendor_id'] = vendor_id
                if device_id:
                    device_info['device_id'] = device_id
                if device_name:
                    device_info['device_name'] = device_name
                    device_info['product_name'] = device_name
                if serial_number:
                    device_info['serial_number'] = serial_number
            
            # 센서 디바이스의 펌웨어 버전은 HTML 테이블에 없으므로 제거
            # (IO-Link Master의 펌웨어 버전과 혼동 방지)
        else:
            device_info['error'] = f'HTTP {response.status_code}'
            
    except requests.exceptions.RequestException as e:
        device_info['error'] = f'IO-Link Master 연결 실패: {str(e)}'
    except Exception as e:
        device_info['error'] = f'정보 조회 실패: {str(e)}'
    
    return device_info

def get_sensor_info(iolink_ip, port='2'):
    """센서 정보 가져오기 (MQTT 우선, 없으면 HTML 파싱)"""
    global sensor_device_info
    
    # 먼저 MQTT에서 추출한 센서 정보 확인
    if sensor_device_info.get('connected') and sensor_device_info.get('last_updated'):
        # 최근 5분 이내에 업데이트된 정보가 있으면 사용
        if time.time() - sensor_device_info['last_updated'] < 300:
            return {
                'port': sensor_device_info.get('port', port),
                'connected': True,
                'device_id': sensor_device_info.get('device_id'),
                'vendor_id': sensor_device_info.get('vendor_id'),
                'product_name': sensor_device_info.get('product_name'),
                'serial_number': sensor_device_info.get('serial_number'),
                'firmware_version': sensor_device_info.get('firmware_version'),
                'device_name': sensor_device_info.get('device_name'),
                'source': 'mqtt'
            }
    
    # MQTT에서 정보를 못 가져온 경우 HTML 파싱 시도
    return get_sensor_info_from_html(iolink_ip, port)

def get_iolink_master_info(iolink_ip):
    """IO-Link Master 자체의 정보 가져오기"""
    base_url = f'http://{iolink_ip}'
    
    master_info = {
        'connected': False,
        'model_name': None,
        'firmware_version': None,
        'ip_address': iolink_ip,
        'port_count': None,
        'error': None,
        'source': 'html'
    }
    
    try:
        response = requests.get(base_url, timeout=3)
        
        if response.status_code == 200:
            html_content = response.text
            master_info['connected'] = True
            
            # 모델명 추출 (제목에서 AL1326만 추출)
            model_pattern = r'<h1>.*?([A-Z]{1,2}\d{4})\s+IO-Link Master'
            model_match = re.search(model_pattern, html_content, re.IGNORECASE | re.DOTALL)
            if model_match:
                master_info['model_name'] = model_match.group(1).strip()
            
            # 포트 수 추출
            port_pattern = r'(\d+)\s+Port'
            port_match = re.search(port_pattern, html_content, re.IGNORECASE)
            if port_match:
                master_info['port_count'] = int(port_match.group(1))
            
            # IO-Link Master의 펌웨어 버전은 Supervision 테이블에서 가져오기
            firmware_pattern = r'<tr><td>Firmware</td><td>([^<]+)</td></tr>'
            firmware_match = re.search(firmware_pattern, html_content)
            if firmware_match:
                master_info['firmware_version'] = firmware_match.group(1).strip()
        else:
            master_info['error'] = f'HTTP {response.status_code}'
            
    except requests.exceptions.RequestException as e:
        master_info['error'] = f'IO-Link Master 연결 실패: {str(e)}'
    except Exception as e:
        master_info['error'] = f'정보 조회 실패: {str(e)}'
    
    return master_info
