import type { Customer, MaterialFabric, Provider, SampleChooseRecord } from '@/types'

const imageBase = 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?image_size=square&prompt='

export const fabrics: MaterialFabric[] = [
  {
    id: 'm001',
    itemNo: 'MQ-CT-24001',
    name: '高密斜纹棉布',
    category: '棉类面料',
    composition: '100% Cotton',
    construction: 'Twill',
    width: '57/58',
    weight: '320G/M2',
    color: 'Navy',
    costPrice: 18.6,
    provider: '绍兴恒织纺织',
    location: 'A-01-03',
    stockQty: 128,
    image: `${imageBase}${encodeURIComponent('realistic close up navy twill cotton fabric swatch, textile sample, soft studio lighting')}`,
    enabled: true,
  },
  {
    id: 'm002',
    itemNo: 'MQ-PL-24018',
    name: '涤纶弹力布',
    category: '化纤面料',
    composition: '92% Polyester 8% Spandex',
    construction: 'Plain',
    width: '150CM',
    weight: '210G/M2',
    color: 'Black',
    costPrice: 13.2,
    provider: '吴江佳联面料',
    location: 'B-02-11',
    stockQty: 86,
    image: `${imageBase}${encodeURIComponent('black polyester spandex fabric sample, smooth woven texture, realistic product photo')}`,
    enabled: true,
  },
  {
    id: 'm003',
    itemNo: 'MQ-LN-24007',
    name: '亚麻混纺面料',
    category: '麻类面料',
    composition: '55% Linen 45% Cotton',
    construction: 'Slub',
    width: '54/55',
    weight: '260G/M2',
    color: 'Natural',
    costPrice: 24.8,
    provider: '南通本色织造',
    location: 'C-01-08',
    stockQty: 42,
    image: `${imageBase}${encodeURIComponent('natural linen cotton blend fabric swatch, beige textile texture, realistic studio shot')}`,
    enabled: true,
  },
]

export const customers: Customer[] = [
  { id: 'c001', code: 'C-SH-001', name: '上海敏群客户A', contact: '王小姐', region: '上海', status: '合作中' },
  { id: 'c002', code: 'C-HK-002', name: '香港样衣公司', contact: 'Jason', region: '香港', status: '合作中' },
]

export const providers: Provider[] = [
  { id: 'p001', code: 'P-SX-001', name: '绍兴恒织纺织', contact: '陈经理', phone: '13800000001', region: '浙江绍兴', status: '合作中' },
  { id: 'p002', code: 'P-WJ-002', name: '吴江佳联面料', contact: '李经理', phone: '13800000002', region: '江苏吴江', status: '合作中' },
]

export const sampleRecords: SampleChooseRecord[] = [
  { id: 's001', orderNo: 'SY20240710001', customerName: '香港样衣公司', chooseDate: '2026-07-10', operator: '业务员工', itemCount: 5, status: '已保存' },
  { id: 's002', orderNo: 'SY20240709003', customerName: '上海敏群客户A', chooseDate: '2026-07-09', operator: '管理员', itemCount: 3, status: '已导出' },
]
