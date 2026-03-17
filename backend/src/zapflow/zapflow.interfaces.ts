export interface ZapFlowAtendimento {
  z90_ate_id: number;
  z90_ate_id_cliente: number;
  z90_ate_id_canal_suporte: number | null;
  z90_ate_id_tecnico_responsavel: number | null;
  z90_ate_id_agente_ia_inicial: number | null;
  z90_ate_id_sistema_suporte: number | null;
  z90_ate_id_status_atendimento: number;
  z90_ate_data_abertura: Date;
  z90_ate_data_fechamento: Date | null;
  z90_ate_resumo_do_problema: string | null;
  z90_ate_resumo_da_solucao: string | null;
  z90_ate_acoes_realizadas: string | null;
  z90_ate_transbordo_dev: Date | null;
  z90_ate_bug_solucionado: Date | null;
  z90_ate_avaliacao_cliente: number | null;
  z90_ent_id: number;
  z90_ate_guid: string | null;
  z90_ate_resumo_ate: string | null;
  z90_ate_resumo_sol_ate: string | null;
  z90_ate_descricao: string | null;
}

export interface ZapFlowInteracao {
  z90_int_id: number;
  z90_ate_id: number;
  z90_int_data_hora_envio: Date;
  z90_int_id_tipo_remetente: number;
  z90_int_id_remetente_usuario: number | null;
  z90_int_id_remetente_cliente: number | null;
  z90_int_id_remetente_agente_ia: number | null;
  z90_int_conteudo_mensagem: string | null;
  z90_int_id_tipo_mensagem: number;
  z90_int_id_mensagem_whatsapp: string | null;
  z90_int_lida: string;
  z90_int_origem: string | null;
  z90_int_nome_arquivo: string | null;
  z90_int_mensagem_interna: string | null;
}

export interface ZapFlowEntidade {
  z90_ent_id: number;
  z90_ent_razao_social: string;
  z90_ent_cnpj: string | null;
  z90_ent_telefone_principal: string | null;
  z90_ent_email_principal: string | null;
  z90_ent_ativo: string | null;
  z90_ent_contrato_valido_ate: Date | null;
  z90_ent_ponto_focal: string | null;
  z90_ent_id_entidade_clickup: string | null;
  z90_ent_id_cliente_clickup: string | null;
}

export interface ZapFlowSistema {
  z90_sis_id: number;
  z90_sis_nome_sistema: string;
  z90_sis_descricao: string | null;
  z90_sis_versao_atual: string | null;
  z90_sis_sigla: string | null;
  z90_age_id: number | null;
  z90_sis_id_clickup: string | null;
}

export interface ZapFlowAgenteIA {
  z90_age_id: number;
  z90_age_nome_agente: string;
  z90_age_descricao_fun: string | null;
  z90_age_endpoint_api: string | null;
  z90_age_modelo_ia: string | null;
  z90_age_prompt_base: string | null;
  z90_age_ativo: string;
  z90_age_id_assistente: string | null;
}

export interface ZapFlowTecnico {
  z90_tec_id: number;
  z90_tec_nome: string;
  z90_tec_email: string;
  z90_tec_telefone: string;
  z90_tec_ativo: string;
  z90_tec_disponivel: string | null;
  z90_tec_desligado: string | null;
}

export interface ZapFlowTransbordo {
  z90_att_id: number;
  z90_ate_id: number;
  z90_ate_data: Date;
  z90_tec_id_origem: number | null;
  z90_tec_id_destino: number | null;
  z90_ate_resumo: string | null;
  z90_ate_rotina: string | null;
}

