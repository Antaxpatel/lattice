export type Gpu = {
  id: number;
  name: string;
  vendor: string;
  vram_gb: number;
  bandwidth_gbs: number;
  pcie_gen: number;
  pcie_lanes: number;
  tdp_w: number;
  architecture: string;
  form_factor: string;
  fp16_tflops: number;
  category: string;
  created_at?: string;
};

export type ModelRow = {
  id: number;
  hf_id: string;
  name: string;
  architecture: string;
  total_params_b: number;
  active_params_b: number;
  hidden_size: number;
  num_layers: number;
  num_attention_heads: number;
  num_kv_heads: number;
  head_dim: number;
  intermediate_size: number;
  vocab_size: number;
  context_length: number;
  num_experts: number;
  num_experts_per_tok: number;
  is_moe: boolean;
  dtype: string;
  license: string;
  downloads: number;
  created_at?: string;
};

export type GpuProfile = {
  id: number;
  user_id: string;
  name: string;
  gpu_id: number | null;
  gpu_name: string;
  vram_gb: number;
  bandwidth_gbs: number;
  pcie_gen: number;
  pcie_lanes: number;
  gpu_count: number;
  system_ram_gb: number;
  created_at?: string;
};

export type QuantRow = {
  family: string;
  name: string;
  bpw: number;
  quality: number;
  quality_label: string;
  weight_gb: number;
  kv_gb: number;
  overhead_gb: number;
  total_gb: number;
  fits: boolean;
  gpus_needed: number;
  offload_gb: number;
  tps: number;
  tps_prefill: number;
  backend: string;
  notes: string;
};

export type ServerConfig = {
  id: string;
  title: string;
  subtitle: string;
  quant: string;
  backend: string;
  gpu_count: number;
  tps: number;
  vram_used_gb: number;
  quality: number;
  fit: 'single' | 'multi' | 'offload' | 'impossible';
  notes: string[];
  command: string;
};

export type CalcResult = {
  model: ModelRow;
  hardware: {
    gpu_name: string;
    vram_gb: number;
    bandwidth_gbs: number;
    pcie_gen: number;
    pcie_lanes: number;
    gpu_count: number;
    system_ram_gb: number;
    pcie_gbs: number;
    usable_vram_gb: number;
  };
  settings: {
    context_length: number;
    batch_size: number;
    kv_dtype: string;
  };
  recommended_quant: string;
  recommended_family: string;
  fits: boolean;
  tps_estimate: number;
  vram_used_gb: number;
  quants: QuantRow[];
  configs: ServerConfig[];
  moe: {
    is_moe: boolean;
    total_params_b: number;
    active_params_b: number;
    activation_ratio: number;
    experts: number;
    experts_per_tok: number;
    note: string;
  };
  kv: {
    bytes: number;
    per_token_mb: number;
    at_context_gb: number;
    dtype: string;
  };
  warnings: string[];
};

export type SavedCalc = {
  id: number;
  user_id: string;
  model_id: number | null;
  hf_id: string;
  profile_id: number | null;
  gpu_name: string;
  vram_gb: number;
  bandwidth_gbs: number;
  pcie_gen: number;
  gpu_count: number;
  context_length: number;
  batch_size: number;
  recommended_quant: string;
  fits: boolean;
  tps_estimate: number;
  vram_used_gb: number;
  result_json: CalcResult;
  created_at: string;
};
