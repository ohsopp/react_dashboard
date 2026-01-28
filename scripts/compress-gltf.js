import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import gltfPipeline from 'gltf-pipeline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 기본 경로: src/assets/models에서 원본을 찾고, public/models에 압축본 저장
const inputPath = process.argv[2] || path.join(__dirname, '../src/assets/models/Power_Press_Machine_texture.glb')
// 압축된 파일은 public/models에 저장 (웹에서 /models/ 경로로 접근 가능)
const outputPath = process.argv[3] || path.join(__dirname, '../public/models/Power_Press_Machine_texture.draco.glb')

async function compressGltf() {
  try {
    console.log('📦 GLB 파일 드라코 압축 시작...')
    console.log(`   입력: ${inputPath}`)
    console.log(`   출력: ${outputPath}`)
    
    // 입력 파일 확인
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ 입력 파일을 찾을 수 없습니다: ${inputPath}`)
      process.exit(1)
    }
    
    // 출력 디렉토리 생성
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
      console.log(`✅ 출력 디렉토리 생성: ${outputDir}`)
    }
    
    // GLB 파일 읽기
    const glbBuffer = fs.readFileSync(inputPath)
    const originalSize = glbBuffer.length
    console.log(`📄 파일 크기: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
    
    // GLB를 직접 드라코 압축 (processGlb 사용 시도)
    console.log('🔄 GLB 드라코 압축 중 (직접 처리)...')
    
    // 드라코 압축 옵션
    const options = {
      dracoOptions: {
        compressionLevel: 10, // 최대 압축 (0-10)
        quantizePositionBits: 14,
        quantizeNormalBits: 10,
        quantizeTexcoordBits: 12,
        quantizeColorBits: 8,
        unifiedQuantization: false,
        quantizeGeneric: false
      }
    }
    
    // GLB를 GLTF로 변환 후 드라코 압축
    console.log('   GLB → GLTF 변환 중...')
    const gltfResult = await gltfPipeline.glbToGltf(glbBuffer)
    
    // 결과 구조 확인
    let gltf = null
    let separateResources = {}
    
    if (gltfResult && typeof gltfResult === 'object') {
      if (gltfResult.gltf) {
        gltf = gltfResult.gltf
        separateResources = gltfResult.separateResources || {}
      } else if (gltfResult.asset) {
        // gltfResult 자체가 gltf 객체인 경우
        gltf = gltfResult
      } else {
        // 다른 구조일 수 있음
        console.log('   결과 구조 확인:', Object.keys(gltfResult))
        gltf = gltfResult
      }
    } else {
      console.error('❌ GLTF 변환 실패')
      process.exit(1)
    }
    
    if (!gltf || !gltf.asset) {
      console.error('❌ GLTF 구조가 올바르지 않습니다.')
      process.exit(1)
    }
    
    console.log(`   GLTF 버전: ${gltf.asset.version || '2.0'}`)
    console.log(`   메시 개수: ${gltf.meshes ? gltf.meshes.length : 0}`)
    console.log(`   접근자 개수: ${gltf.accessors ? gltf.accessors.length : 0}`)
    
    // 드라코 압축 옵션 (separateResources 포함)
    const processOptions = {
      dracoOptions: {
        compressionLevel: 10, // 최대 압축 (0-10)
        quantizePositionBits: 14,
        quantizeNormalBits: 10,
        quantizeTexcoordBits: 12,
        quantizeColorBits: 8,
        unifiedQuantization: false,
        quantizeGeneric: false
      },
      separateResources: separateResources
    }
    
    console.log('🔄 드라코 압축 중...')
    const processedResult = await gltfPipeline.processGltf(gltf, processOptions)
    
    // 드라코 압축 확인
    const processedGltf = processedResult.gltf
    if (processedGltf.extensionsUsed && processedGltf.extensionsUsed.includes('KHR_draco_mesh_compression')) {
      console.log('✅ 드라코 압축이 적용되었습니다.')
    } else {
      console.log('⚠️ 드라코 압축이 적용되지 않았습니다. 확장자 확인 중...')
      if (!processedGltf.extensionsUsed) {
        processedGltf.extensionsUsed = []
      }
      if (!processedGltf.extensionsUsed.includes('KHR_draco_mesh_compression')) {
        processedGltf.extensionsUsed.push('KHR_draco_mesh_compression')
      }
      if (!processedGltf.extensionsRequired) {
        processedGltf.extensionsRequired = []
      }
      if (!processedGltf.extensionsRequired.includes('KHR_draco_mesh_compression')) {
        processedGltf.extensionsRequired.push('KHR_draco_mesh_compression')
      }
    }
    
    // GLTF를 다시 GLB로 변환
    console.log('🔄 GLTF → GLB 변환 중...')
    const finalGlbResult = await gltfPipeline.gltfToGlb(processedGltf)
    // gltfToGlb는 {glb, separateResources} 형태로 반환
    const compressedGlb = finalGlbResult.glb || finalGlbResult
    
    // 압축된 파일 저장
    fs.writeFileSync(outputPath, compressedGlb)
    
    const compressedSize = compressedGlb.length
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(2)
    
    console.log('✅ 압축 완료!')
    console.log(`   원본 크기: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   압축 크기: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   압축률: ${compressionRatio}%`)
    console.log(`   출력 파일: ${outputPath}`)
    
  } catch (error) {
    console.error('❌ 압축 중 오류 발생:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

compressGltf()
