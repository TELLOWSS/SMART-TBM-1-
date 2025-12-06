
import { TeamCategory, TeamOption } from './types';

export const TEAMS: TeamOption[] = [
  // 형틀 팀들
  { id: 'form-lth1', name: '이태호 1팀', category: TeamCategory.FORMWORK },
  { id: 'form-lth2', name: '이태호 2팀', category: TeamCategory.FORMWORK },
  { id: 'form-moj', name: '명오지팀', category: TeamCategory.FORMWORK },
  { id: 'form-abs', name: '안병삼팀', category: TeamCategory.FORMWORK },
  { id: 'form-kch', name: '김철희팀', category: TeamCategory.FORMWORK },
  { id: 'form-lsj', name: '이세정팀', category: TeamCategory.FORMWORK },
  
  // 철근 팀들
  { id: 'rebar-1', name: '철근팀', category: TeamCategory.REBAR },
  
  // 할석/미장/견출 통합
  { id: 'finish-integrated', name: '할석미장견출', category: TeamCategory.FINISHING },

  // 기타 팀들
  { id: 'system-1', name: '시스템팀', category: TeamCategory.SYSTEM },
  { id: 'scaffold-1', name: '콘크리트비계팀', category: TeamCategory.CONCRETE_SCAFFOLD },
  { id: 'direct-1', name: '직영/용역팀', category: TeamCategory.DIRECT },
];

export const MOCK_WEATHER = {
  temp: 22,
  condition: '맑음',
};
