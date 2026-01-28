import { useRef, Suspense, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, Html, useProgress } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as THREE from 'three'
import { Hotspot } from './Hotspot'
import './ModelViewer.css'

// 드라코 로더 전역 설정
let dracoLoaderInstance = null

function setupDracoLoader() {
  if (!dracoLoaderInstance) {
    dracoLoaderInstance = new DRACOLoader()
    dracoLoaderInstance.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  }
  return dracoLoaderInstance
}

// 로딩 진행 상태 표시 컴포넌트
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="model-loader">
        <div className="loader-text">모델 로딩 중...</div>
        <div className="loader-bar">
          <div 
            className="loader-progress" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="loader-percent">{Math.round(progress)}%</div>
      </div>
    </Html>
  )
}

// OBJ 모델 로더 컴포넌트 (MTL 머티리얼 지원)
function ObjModel({ url, mtlUrl = null, isRotating = true, hotspots = [], onHotspotClick }) {
  const materials = mtlUrl ? useLoader(MTLLoader, mtlUrl) : null
  
  const obj = useLoader(
    OBJLoader,
    url,
    materials ? (loader) => {
      materials.preload()
      loader.setMaterials(materials)
    } : undefined
  )
  
  const meshRef = useRef()
  const groupRef = useRef()

  useFrame((state, delta) => {
    if (meshRef.current && isRotating) {
      meshRef.current.rotation.y += delta * 0.03
    }
  })

  const box = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = 2 / maxDim
  
  const modelPosition = [-center.x * scale, -center.y * scale, -center.z * scale]

  return (
    <group ref={groupRef}>
      <primitive
        ref={meshRef}
        object={obj}
        position={modelPosition}
        scale={scale}
      />
      {/* Hotspots - 모델과 함께 회전 */}
      {hotspots.map((hotspot) => (
        <Hotspot
          key={hotspot.number}
          position={[
            modelPosition[0] + hotspot.position[0] * scale,
            modelPosition[1] + hotspot.position[1] * scale,
            modelPosition[2] + hotspot.position[2] * scale
          ]}
          number={hotspot.number}
          info={hotspot.info}
          onClick={onHotspotClick}
          isActive={hotspot.isActive}
        />
      ))}
    </group>
  )
}

// GLTF 모델 로더 컴포넌트 (드라코 압축 지원)
function GltfModel({ url, useDraco = false, isRotating = true, hotspots = [], onHotspotClick }) {
  const isDracoEnabled = useDraco || url.includes('.draco.')
  
  // GLTFLoader에 드라코 로더 설정
  const gltf = useLoader(
    GLTFLoader,
    url,
    (loader) => {
      if (isDracoEnabled) {
        const dracoLoader = setupDracoLoader()
        loader.setDRACOLoader(dracoLoader)
      }
    }
  )
  
  const meshRef = useRef()
  const groupRef = useRef()
  
  useEffect(() => {
    if (gltf && gltf.scene) {
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.material) {
          const material = child.material
          
          if (material.map) {
            material.map.needsUpdate = true
            material.needsUpdate = true
          }
          
          if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
            if (material.map) {
              material.color.setRGB(1, 1, 1)
            }
            material.metalness = 0.1
            material.roughness = 0.8
          }
          
          material.needsUpdate = true
        }
      })
    }
  }, [gltf])

  useFrame((state, delta) => {
    if (meshRef.current && isRotating) {
      meshRef.current.rotation.y += delta * 0.05
    }
  })

  const box = new THREE.Box3().setFromObject(gltf.scene)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = 2 / maxDim
  
  const modelPosition = [-center.x * scale, -center.y * scale, -center.z * scale]

  return (
    <group ref={groupRef}>
      <primitive
        ref={meshRef}
        object={gltf.scene}
        position={modelPosition}
        scale={scale}
      />
      {/* Hotspots - 모델과 함께 회전 */}
      {hotspots.map((hotspot) => (
        <Hotspot
          key={hotspot.number}
          position={[
            modelPosition[0] + hotspot.position[0] * scale,
            modelPosition[1] + hotspot.position[1] * scale,
            modelPosition[2] + hotspot.position[2] * scale
          ]}
          number={hotspot.number}
          info={hotspot.info}
          onClick={onHotspotClick}
          isActive={hotspot.isActive}
        />
      ))}
    </group>
  )
}

// 카메라와 컨트롤 참조를 외부로 전달하는 컴포넌트
function CameraRef({ controlsRef, cameraRef }) {
  const { camera } = useThree()
  
  useEffect(() => {
    if (cameraRef) {
      cameraRef.current = camera
    }
  }, [camera, cameraRef])
  
  return null
}

// OrbitControls 컴포넌트 (Hotspot 클릭 방해 방지)
function CameraControls({ enableZoom = true, controlsRef }) {
  const { gl } = useThree()
  
  useEffect(() => {
    if (!controlsRef?.current) return
    
    const controls = controlsRef.current
    const domElement = gl.domElement
    
    // Hotspot 클릭 시 OrbitControls 일시 비활성화 - 최적화된 핸들러
    const handlePointerDown = (e) => {
      // 빠른 조기 종료
      if (e.target?.dataset?.hotspot !== 'true') return
      
      controls.enabled = false
      // requestAnimationFrame으로 최적화
      requestAnimationFrame(() => {
        controls.enabled = true
      })
    }
    
    domElement.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false })
    
    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    }
  }, [gl, controlsRef])
  
  return (
    <OrbitControls 
      ref={controlsRef} 
      enableDamping 
      dampingFactor={0.05} 
      minDistance={2} 
      maxDistance={20}
      enableZoom={enableZoom}
      enablePan={enableZoom} // 패널에서는 pan도 비활성화하여 드래그로 페이지 스크롤 가능
    />
  )
}

// 메인 뷰어 컴포넌트
export default function ModelViewer({ 
  modelPath = '/models/model.draco.glb', 
  mtlPath = null, 
  useGltf = true, 
  useDraco = true,
  instanceKey = 'default', // 모달과 패널을 구분하기 위한 key
  enableZoom = true, // 모달에서는 true, 패널에서는 false
  hotspots = [] // Hotspot 데이터 배열
}) {
  const [isRotating, setIsRotating] = useState(false)
  const [activeHotspot, setActiveHotspot] = useState(null)
  const containerRef = useRef(null)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  
  // Hotspot 클릭 핸들러 (토글 기능) - useCallback으로 메모이제이션
  const handleHotspotClick = useCallback((number) => {
    setActiveHotspot(prev => {
      if (prev?.number === number) {
        return null
      }
      return hotspots.find(h => h.number === number) || null
    })
  }, [hotspots])
  
  // 활성화된 hotspot 업데이트 - useMemo로 메모이제이션
  const hotspotsWithActive = useMemo(() => {
    return hotspots.map(h => ({
      ...h,
      isActive: activeHotspot?.number === h.number
    }))
  }, [hotspots, activeHotspot])
  
  // 줌 인/아웃 핸들러 - useCallback으로 메모이제이션
  const handleZoomIn = useCallback(() => {
    if (controlsRef.current && cameraRef.current) {
      const controls = controlsRef.current
      const camera = cameraRef.current
      const target = controls.target
      
      // 현재 거리 계산
      const direction = new THREE.Vector3()
      direction.subVectors(camera.position, target).normalize()
      const currentDistance = camera.position.distanceTo(target)
      
      // 20% 가까이 이동 (최소 거리 2 유지)
      const newDistance = Math.max(2, currentDistance * 0.8)
      camera.position.copy(target).add(direction.multiplyScalar(newDistance))
      controls.update()
    }
  }, [])
  
  const handleZoomOut = useCallback(() => {
    if (controlsRef.current && cameraRef.current) {
      const controls = controlsRef.current
      const camera = cameraRef.current
      const target = controls.target
      
      // 현재 거리 계산
      const direction = new THREE.Vector3()
      direction.subVectors(camera.position, target).normalize()
      const currentDistance = camera.position.distanceTo(target)
      
      // 25% 멀리 이동 (최대 거리 20 유지)
      const newDistance = Math.min(20, currentDistance * 1.25)
      camera.position.copy(target).add(direction.multiplyScalar(newDistance))
      controls.update()
    }
  }, [])
  
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    // SortableJS와의 충돌 방지: Canvas에서만 드래그 이벤트 전파 중지
    // 패널 헤더나 다른 부분에서는 SortableJS가 작동하도록 함
    const handleMouseDown = (e) => {
      // Canvas 요소에서만 이벤트 전파 중지
      const canvas = e.target.tagName === 'CANVAS' ? e.target : e.target.closest('canvas')
      if (canvas) {
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }
    
    container.addEventListener('mousedown', handleMouseDown, true) // capture phase
    
    return () => {
      container.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [])
  
  return (
    <div className="model-viewer-container" ref={containerRef}>
      
      <Canvas 
        key={instanceKey} // key prop으로 인스턴스 분리
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ 
          width: '100%', 
          height: '100%',
          touchAction: 'none',
          userSelect: 'none',
          cursor: 'grab'
        }}
        gl={{ 
          preserveDrawingBuffer: false,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
        dpr={[1, 2]} // 디바이스 픽셀 비율 제한 (성능 향상)
        performance={{ min: 0.5 }} // 성능 모니터링
        onCreated={({ gl, scene }) => {
          // Scene 배경색 설정 (대시보드 배경색과 동일)
          scene.background = new THREE.Color(0x0a0a0b)
          
          // Canvas DOM 요소에 직접 스타일 및 이벤트 설정
          const canvas = gl.domElement
          canvas.style.touchAction = 'none'
          canvas.style.userSelect = 'none'
          canvas.style.cursor = 'grab'
          canvas.style.pointerEvents = 'auto'
          
          // WebGL 컨텍스트 손실 방지
          const handleContextLost = (event) => {
            event.preventDefault()
          }
          
          const handleContextRestored = () => {
            // 컨텍스트 복원 후 렌더러 재초기화
            gl.forceContextRestore()
            // 배경색 재설정
            scene.background = new THREE.Color(0x0a0a0b)
          }
          
          canvas.addEventListener('webglcontextlost', handleContextLost, false)
          canvas.addEventListener('webglcontextrestored', handleContextRestored, false)
          
          // 드래그 중 커서 변경 - 이벤트 최적화
          const handleMouseDown = () => {
            canvas.style.cursor = 'grabbing'
          }
          const handleMouseUp = () => {
            canvas.style.cursor = 'grab'
          }
          const handleMouseLeave = () => {
            canvas.style.cursor = 'grab'
          }
          
          // passive 옵션으로 성능 향상
          canvas.addEventListener('mousedown', handleMouseDown, { passive: true })
          canvas.addEventListener('mouseup', handleMouseUp, { passive: true })
          canvas.addEventListener('mouseleave', handleMouseLeave, { passive: true })
          
          return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost, false)
            canvas.removeEventListener('webglcontextrestored', handleContextRestored, false)
            canvas.removeEventListener('mousedown', handleMouseDown)
            canvas.removeEventListener('mouseup', handleMouseUp)
            canvas.removeEventListener('mouseleave', handleMouseLeave)
          }
        }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[10, 10, 5]} intensity={2} />
        <directionalLight position={[-10, 10, -5]} intensity={1.5} />
        <pointLight position={[0, 10, 0]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.8} />
        
        <Suspense fallback={<Loader />}>
          {useGltf ? (
            <GltfModel 
              url={modelPath} 
              useDraco={useDraco} 
              isRotating={isRotating}
              hotspots={hotspotsWithActive}
              onHotspotClick={handleHotspotClick}
            />
          ) : (
            <ObjModel 
              url={modelPath} 
              mtlUrl={mtlPath} 
              isRotating={isRotating}
              hotspots={hotspotsWithActive}
              onHotspotClick={handleHotspotClick}
            />
          )}
        </Suspense>
        
        <CameraRef controlsRef={controlsRef} cameraRef={cameraRef} />
        <CameraControls 
          enableZoom={enableZoom} 
          controlsRef={controlsRef}
        />
        <Environment preset="studio" />
      </Canvas>
      
      {/* 줌 인/아웃 버튼 */}
      <div className="model-viewer-zoom-controls">
        <button 
          className="zoom-btn zoom-in-btn"
          onClick={handleZoomIn}
          title="줌 인"
        >
          +
        </button>
        <button 
          className="zoom-btn zoom-out-btn"
          onClick={handleZoomOut}
          title="줌 아웃"
        >
          −
        </button>
      </div>
      
      {/* Hotspot 정보 레이블 */}
      {activeHotspot && (
        <div className="hotspot-info-label">
          <div className="hotspot-info-title">
            위치 #{activeHotspot.number}
          </div>
          <div className="hotspot-info-text">
            {activeHotspot.info || `위치 ${activeHotspot.number}에 대한 정보입니다.`}
          </div>
        </div>
      )}
    </div>
  )
}
