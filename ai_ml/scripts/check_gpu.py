"""
GPU 감지 확인 스크립트
"""
import torch

print("=" * 60)
print("🔍 PyTorch GPU 감지 확인")
print("=" * 60)

print(f"PyTorch 버전: {torch.__version__}")
print(f"CUDA 사용 가능: {torch.cuda.is_available()}")

# ROCm 확인
if hasattr(torch.version, 'hip') and torch.version.hip:
    print(f"ROCm 버전: {torch.version.hip}")
    print("✅ ROCm (AMD GPU) 지원 활성화됨")
else:
    print("ROCm: 사용 불가")

# CUDA 확인
if hasattr(torch.version, 'cuda') and torch.version.cuda:
    print(f"CUDA 버전: {torch.version.cuda}")
    print("✅ CUDA (NVIDIA GPU) 지원 활성화됨")

print("-" * 60)

if torch.cuda.is_available():
    device_count = torch.cuda.device_count()
    print(f"✅ GPU 감지됨: {device_count}개")
    
    for i in range(device_count):
        print(f"\nGPU {i}:")
        print(f"  이름: {torch.cuda.get_device_name(i)}")
        props = torch.cuda.get_device_properties(i)
        print(f"  총 메모리: {props.total_memory / (1024**3):.2f} GB")
        print(f"  컴퓨팅 능력: {props.major}.{props.minor}")
    
    device = torch.device('cuda')
    print(f"\n✅ 사용할 디바이스: {device}")
    print("🚀 GPU로 학습할 수 있습니다!")
else:
    print("⚠️ GPU가 감지되지 않았습니다.")
    print("💡 CPU로 학습합니다.")
    device = torch.device('cpu')
    print(f"사용할 디바이스: {device}")

print("=" * 60)

# 간단한 테스트
print("\n간단한 테스트 실행 중...")
try:
    x = torch.randn(3, 3).to(device)
    y = torch.randn(3, 3).to(device)
    z = torch.matmul(x, y)
    print(f"✅ 테스트 성공! 디바이스: {device}")
    print(f"   결과 텐서 위치: {z.device}")
except Exception as e:
    print(f"❌ 테스트 실패: {e}")

print("=" * 60)
