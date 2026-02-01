# 흑적기 1단계 (MVP버전)

# 파이썬에서 구현할 목표 기능

# [입력값]
# 사냥 시간 == 1시간 고정
# 사용한 물약 수량 × 가격
# 기타 소비 아이템 수량 × 가격
# 획득한 메소 총량
# 드롭 아이템(아이템명 / 수량 / 단가)
# 지참금(내는 돈)or지원금(받는 돈)

# [계산 식]
# 총 지출 = 물약비 + 기타 아이템 비용
# 총 수입 = 메소 + (드롭 아이템 수량 × 가격)
# 순수익 = 총 수입 – 총 지출
# 시간당 수익 = 순수익 / 시간

potions={
    '빨간포션': 50,
    '주황포션': 160,
    '하얀포션': 320,
    '파란포션': 200,
    '마엘': 620,

    '장어구이': 1100,
    '맑은물': 1650,
    '수박': 3200,
    '쭈쭈바': 2300,
    '팥빙수': 4000,

    '치즈': 4500,
    '우유': 5600,
    '새벽이슬': 7695,
    '황혼이슬': 9690,

    '사과': 40,
    '오렌지': 97,
    '레몬': 305,
    '길핫': 304,
    '통닭': 209,
    '뚱핫': 503
}

def start_hunt(
        meso_before: int,
        potion_before: dict,
        bring_money: int=None,
        support_money: int=None,    
):
    # 지참금, 지원금 동시입력 예외처리
    if bring_money is not None and support_money is not None:
        raise ValueError('지참금과 지원금은 동시에 입력할 수 없습니다.')
    
    if bring_money is not None:
        external_value = -bring_money
    elif support_money is not None:
        external_value = support_money
    else:
        external_value = 0

    return{
        'meso_before': meso_before,
        'potion_before': potion_before,
        'external_value': external_value
    }

def end_hunt(
    start_data: dict,
    meso_after: int,
    potion_after: dict,
    potions : dict,
    items : int = 0    
):
    # 사냥 전 정보 불러오기
    meso_before= start_data['meso_before']
    potion_before= start_data['potion_before']
    external_value= start_data['external_value']

    # 순메소
    net_meso= meso_after-meso_before
    
    # 포션
    potion_used= {}
    potion_cost= 0

    for potion, before_cnt in potion_before.items():
        after_cnt = potion_after.get(potion, 0)
        used = before_cnt - after_cnt
        price= potions.get(potion, 0)
        cost= used * price

        potion_cost += cost

        potion_used[potion] ={
            'used':used,
            'price':price,
            'cost':cost
        }

    final_result= (
        net_meso
        + items
        - potion_cost
        + external_value
    )

    return{
        'net_meso':net_meso,
        'potion_used':potion_used,
        'potion_cost':potion_cost,
        'items':items,
        'external_value':external_value,
        'final_result':final_result
    }

# 함수 체크
# session= start_hunt(
#     meso_before= 3200000,
#     potion_before={
#         '쭈쭈바':800,
#         '마엘':1000
#     },
#     bring_money= 400000
# )

# 출력문 만들기
def print_report(result: dict):
    print('\n [사냥 결과 요약] \n')

    # 메소
    print('\n▷ 메소 변화')
    print(f"- 메소 순이익 : {result['net_meso']:,} 메소")

    # 포션
    print('\n▷ 포션 사용 내역')
    for potion, info in result['potion_used'].items():
        if info['used'] <= 0 :
            continue
        print(
            f"- {potion} : {info['used']:,}개 사용"
            f"(-{info['cost']:,})"
    )

    print(f"▷ 포션 총 비용 : {result['potion_cost']:,} 메소")

    # 득템
    print('\n▷ 득템')
    print(f"- 득템 금액 : {result['items']:,}")

    # 지참금/지원금
    print('\n▷ 쩔비')
    external = result['external_value']

    if external < 0:
        print(f"- 지참금 : -{-external:,} 메소")
    elif external >0:
        print(f"- 지원금 : +{external:,} 메소")
    else:
        print('- 없음')

    final= result['final_result']
    if final >= 0:
        print(f'\n▶ 최종 결과 : {final:,} 흑자')
    else:
        print(f'\n▶ 최종 결과 : {final:,} 적자')


jh_start= start_hunt(
    meso_before= 3400000,
    potion_before={
        '쭈쭈바': 800,
        '마엘' : 1000
    },
    bring_money= 400000
)

jh_end= end_hunt(
    start_data= jh_start,
    meso_after= 3780000,
    potion_after={
        '쭈쭈바' : 578,
        '마엘' : 628
    },
    potions=potions
)

print_report(jh_end)


    

    




