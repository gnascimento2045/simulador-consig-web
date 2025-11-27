import React, { useState, useRef } from 'react';
import './App.css';
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Badge } from './components/ui/badge';
import { Separator } from './components/ui/separator';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { FileText, Calculator, Download, Copy, Settings, Banknote, TrendingDown, DollarSign } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [activeTab, setActiveTab] = useState('contratos');
  const [textoContratos, setTextoContratos] = useState('');
  const [contratosParsed, setContratosParsed] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [bancoSelecionado, setBancoSelecionado] = useState('');
  const [margemDisponivel, setMargemDisponivel] = useState('');
  const [valorDesejado, setValorDesejado] = useState('');
  const [parcelaDesejada, setParcelaDesejada] = useState('');
  const [tipoBeneficio, setTipoBeneficio] = useState('INSS');
  const [prazo, setPrazo] = useState('84');
  const [percentualINSS, setPercentualINSS] = useState('35');
  const [percentualSIAPE, setPercentualSIAPE] = useState('35');
  const [simulacao, setSimulacao] = useState(null);
  const [nomeCliente, setNomeCliente] = useState('');
  const [editandoBancos, setEditandoBancos] = useState(false);
  const [bancosEditados, setBancosEditados] = useState([]);
  const simulacaoRef = useRef(null);

  // Carrega bancos
  React.useEffect(() => {
    carregarBancos();
  }, []);

  const carregarBancos = async () => {
    try {
      const response = await axios.get(`${API}/bancos`);
      setBancos(response.data);
      if (response.data.length > 0) {
        setBancoSelecionado(response.data[0].codigo);
      }
    } catch (error) {
      toast.error('Erro ao carregar bancos');
    }
  };

  const parseContratos = async () => {
    if (!textoContratos.trim()) {
      toast.error('Cole os contratos antes de continuar');
      return;
    }

    try {
      const response = await axios.post(`${API}/parse-contratos`, {
        texto: textoContratos
      });
      
      setContratosParsed(response.data);
      toast.success(`${response.data.length} contrato(s) identificado(s)`);
      setActiveTab('simulacao');
    } catch (error) {
      toast.error('Erro ao processar contratos');
    }
  };

  const realizarSimulacao = async () => {
    if (contratosParsed.length === 0) {
      toast.error('Primeiro faça o parse dos contratos');
      return;
    }

    if (!margemDisponivel || parseFloat(margemDisponivel) <= 0) {
      toast.error('Informe a margem disponível');
      return;
    }

    try {
      const response = await axios.post(`${API}/simular`, {
        contratos: contratosParsed,
        margem_disponivel: parseFloat(margemDisponivel),
        valor_desejado: valorDesejado ? parseFloat(valorDesejado) : null,
        parcela_desejada: parcelaDesejada ? parseFloat(parcelaDesejada) : null,
        tipo_beneficio: tipoBeneficio,
        prazo: parseInt(prazo),
        config_margem: {
          percentual_inss: parseFloat(percentualINSS),
          percentual_siape: parseFloat(percentualSIAPE)
        },
        banco_destino: bancoSelecionado
      });

      setSimulacao(response.data);
      toast.success('Simulação realizada com sucesso!');
      setActiveTab('resultado');
    } catch (error) {
      toast.error('Erro ao realizar simulação');
    }
  };

  const copiarTexto = () => {
    if (!simulacao) return;

    const bancoNome = bancos.find(b => b.codigo === bancoSelecionado)?.nome || 'N/A';
    
    let texto = `══════════════════════════════════════\n`;
    texto += `       SIMULAÇÃO DE CONSIGNADO\n`;
    texto += `══════════════════════════════════════\n\n`;
    texto += `Cliente: ${nomeCliente || 'Não informado'}\n`;
    texto += `Tipo: ${tipoBeneficio}\n`;
    texto += `Banco Destino: ${bancoNome}\n`;
    texto += `Prazo: ${prazo} meses\n\n`;
    texto += `──────────────────────────────────────\n`;
    texto += `PORTABILIDADES (${simulacao.portabilidades.length})\n`;
    texto += `──────────────────────────────────────\n`;
    
    simulacao.portabilidades.forEach((p, idx) => {
      texto += `\n${idx + 1}. ${p.banco_origem}\n`;
      texto += `   Contrato: ${p.contrato}\n`;
      texto += `   Saldo: R$ ${p.saldo_devedor.toFixed(2)}\n`;
      texto += `   Taxa: ${p.taxa_antiga}% → ${p.taxa_nova}%\n`;
      texto += `   Parcela: R$ ${p.parcela_antiga.toFixed(2)} → R$ ${p.parcela_nova.toFixed(2)}\n`;
      texto += `   Economia: R$ ${p.economia_mensal.toFixed(2)}/mês\n`;
    });

    texto += `\n──────────────────────────────────────\n`;
    texto += `RESUMO\n`;
    texto += `──────────────────────────────────────\n`;
    texto += `Valor Liberado: R$ ${simulacao.valor_total_liberado.toFixed(2)}\n`;
    texto += `Economia Total: R$ ${simulacao.economia_total_mensal.toFixed(2)}/mês\n`;
    texto += `Nova Parcela Total: R$ ${simulacao.nova_parcela_total.toFixed(2)}\n`;
    texto += `Margem Restante: R$ ${simulacao.margem_restante.toFixed(2)}\n`;
    texto += `CET Aproximado: ${simulacao.cet_aproximado.toFixed(2)}% a.a.\n`;
    texto += `══════════════════════════════════════`;

    navigator.clipboard.writeText(texto);
    toast.success('Texto copiado!');
  };

  const copiarImagem = async () => {
    if (!simulacaoRef.current) return;

    try {
      const canvas = await html2canvas(simulacaoRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      
      canvas.toBlob((blob) => {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard.write([item]);
        toast.success('Imagem copiada!');
      });
    } catch (error) {
      toast.error('Erro ao copiar imagem');
    }
  };

  const calcularParcelaPorValor = (valor) => {
    if (!valor || !bancoSelecionado) return;
    const banco = bancos.find(b => b.codigo === bancoSelecionado);
    if (!banco) return;
    
    const taxa = banco.taxa_novo / 100;
    const n = parseInt(prazo);
    const parcela = valor * (taxa * Math.pow(1 + taxa, n)) / (Math.pow(1 + taxa, n) - 1);
    setParcelaDesejada(parcela.toFixed(2));
  };

  const calcularValorPorParcela = (parcela) => {
    if (!parcela || !bancoSelecionado) return;
    const banco = bancos.find(b => b.codigo === bancoSelecionado);
    if (!banco) return;
    
    const taxa = banco.taxa_novo / 100;
    const n = parseInt(prazo);
    const valor = parcela * ((Math.pow(1 + taxa, n) - 1) / (taxa * Math.pow(1 + taxa, n)));
    setValorDesejado(valor.toFixed(2));
  };

  const iniciarEdicaoBancos = () => {
    setBancosEditados(JSON.parse(JSON.stringify(bancos)));
    setEditandoBancos(true);
  };

  const salvarBancos = async () => {
    try {
      for (const banco of bancosEditados) {
        await axios.put(`${API}/bancos/${banco.codigo}`, banco);
      }
      setBancos(bancosEditados);
      setEditandoBancos(false);
      toast.success('Bancos atualizados com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar bancos');
    }
  };

  const atualizarTaxaBanco = (codigo, campo, valor) => {
    setBancosEditados(prev => 
      prev.map(b => 
        b.codigo === codigo ? { ...b, [campo]: parseFloat(valor) } : b
      )
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent mb-3" data-testid="main-heading">
            Simulador de Crédito Consignado
          </h1>
          <p className="text-gray-600 text-lg" data-testid="subtitle">Portabilidade • Refinanciamento • Margem Consignável</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8" data-testid="main-tabs">
            <TabsTrigger value="contratos" data-testid="tab-contratos">
              <FileText className="w-4 h-4 mr-2" />
              Contratos
            </TabsTrigger>
            <TabsTrigger value="simulacao" data-testid="tab-simulacao">
              <Calculator className="w-4 h-4 mr-2" />
              Simulação
            </TabsTrigger>
            <TabsTrigger value="resultado" disabled={!simulacao} data-testid="tab-resultado">
              <TrendingDown className="w-4 h-4 mr-2" />
              Resultado
            </TabsTrigger>
            <TabsTrigger value="configuracao" data-testid="tab-configuracao">
              <Settings className="w-4 h-4 mr-2" />
              Configuração
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Contratos */}
          <TabsContent value="contratos" data-testid="content-contratos">
            <Card className="shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="contratos-title">
                  <FileText className="w-5 h-5" />
                  Cole os Contratos Existentes
                </CardTitle>
                <CardDescription data-testid="contratos-description">
                  Cole os contratos no formato apresentado (Banco, Contrato, Averbação, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  data-testid="textarea-contratos"
                  placeholder="Cole aqui os contratos...

Exemplo:
329 - QI SOCIEDADE DE CREDITO DIRETO S A
QUA0001117593
24/10/2025
11/2025
10/2033
R$ 994,17
1,50%
R$ 215,49
0/96 - 96 Restantes
11.141,19"
                  className="min-h-[400px] font-mono text-sm"
                  value={textoContratos}
                  onChange={(e) => setTextoContratos(e.target.value)}
                />
                <Button 
                  onClick={parseContratos} 
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  size="lg"
                  data-testid="btn-parse-contratos"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  Processar Contratos
                </Button>
                
                {contratosParsed.length > 0 && (
                  <div className="mt-6" data-testid="contratos-parsed-list">
                    <h3 className="font-semibold mb-3 text-lg" data-testid="parsed-count">Contratos Identificados: {contratosParsed.length}</h3>
                    <div className="space-y-3">
                      {contratosParsed.map((c, idx) => (
                        <Card key={idx} className="bg-gradient-to-r from-blue-50 to-indigo-50" data-testid={`contrato-item-${idx}`}>
                          <CardContent className="pt-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <span className="text-gray-600">Banco:</span>
                                <p className="font-semibold" data-testid={`contrato-banco-${idx}`}>{c.banco}</p>
                              </div>
                              <div>
                                <span className="text-gray-600">Contrato:</span>
                                <p className="font-semibold" data-testid={`contrato-numero-${idx}`}>{c.contrato}</p>
                              </div>
                              <div>
                                <span className="text-gray-600">Saldo Devedor:</span>
                                <p className="font-semibold text-blue-700" data-testid={`contrato-saldo-${idx}`}>R$ {c.saldo_devedor.toFixed(2)}</p>
                              </div>
                              <div>
                                <span className="text-gray-600">Parcela:</span>
                                <p className="font-semibold" data-testid={`contrato-parcela-${idx}`}>R$ {c.valor_parcela.toFixed(2)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Simulação */}
          <TabsContent value="simulacao" data-testid="content-simulacao">
            <div className="grid gap-6">
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle data-testid="simulacao-title">Dados da Simulação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="nome-cliente" data-testid="label-nome-cliente">Nome do Cliente</Label>
                      <Input
                        id="nome-cliente"
                        data-testid="input-nome-cliente"
                        placeholder="Nome completo"
                        value={nomeCliente}
                        onChange={(e) => setNomeCliente(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tipo-beneficio" data-testid="label-tipo-beneficio">Tipo de Benefício</Label>
                      <Select value={tipoBeneficio} onValueChange={setTipoBeneficio}>
                        <SelectTrigger data-testid="select-tipo-beneficio">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INSS" data-testid="option-inss">INSS</SelectItem>
                          <SelectItem value="SIAPE" data-testid="option-siape">SIAPE</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="margem" data-testid="label-margem">Margem Disponível (R$)</Label>
                      <Input
                        id="margem"
                        data-testid="input-margem"
                        type="number"
                        step="0.01"
                        placeholder="Ex: 500.00"
                        value={margemDisponivel}
                        onChange={(e) => setMargemDisponivel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="banco" data-testid="label-banco-destino">Banco Destino</Label>
                      <Select value={bancoSelecionado} onValueChange={setBancoSelecionado}>
                        <SelectTrigger data-testid="select-banco-destino">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {bancos.map(b => (
                            <SelectItem key={b.codigo} value={b.codigo} data-testid={`option-banco-${b.codigo}`}>
                              {b.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg" data-testid="heading-novo-emprestimo">Novo Empréstimo (Opcional)</h3>
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="valor" data-testid="label-valor-desejado">Valor Desejado (R$)</Label>
                        <Input
                          id="valor"
                          data-testid="input-valor-desejado"
                          type="number"
                          step="0.01"
                          placeholder="Ex: 10000.00"
                          value={valorDesejado}
                          onChange={(e) => {
                            setValorDesejado(e.target.value);
                            if (e.target.value) calcularParcelaPorValor(parseFloat(e.target.value));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parcela" data-testid="label-parcela-desejada">Parcela Desejada (R$)</Label>
                        <Input
                          id="parcela"
                          data-testid="input-parcela-desejada"
                          type="number"
                          step="0.01"
                          placeholder="Ex: 250.00"
                          value={parcelaDesejada}
                          onChange={(e) => {
                            setParcelaDesejada(e.target.value);
                            if (e.target.value) calcularValorPorParcela(parseFloat(e.target.value));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="prazo" data-testid="label-prazo">Prazo (meses)</Label>
                        <Select value={prazo} onValueChange={setPrazo}>
                          <SelectTrigger data-testid="select-prazo">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="84" data-testid="option-prazo-84">84 meses</SelectItem>
                            <SelectItem value="96" data-testid="option-prazo-96">96 meses</SelectItem>
                            <SelectItem value="72" data-testid="option-prazo-72">72 meses</SelectItem>
                            <SelectItem value="60" data-testid="option-prazo-60">60 meses</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={realizarSimulacao}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                    size="lg"
                    data-testid="btn-simular"
                  >
                    <Calculator className="w-4 h-4 mr-2" />
                    Realizar Simulação
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 3: Resultado */}
          <TabsContent value="resultado" data-testid="content-resultado">
            {simulacao && (
              <div className="space-y-6">
                {/* Ações */}
                <Card className="shadow-xl">
                  <CardContent className="pt-6">
                    <div className="flex gap-4 justify-center">
                      <Button onClick={copiarTexto} variant="outline" size="lg" data-testid="btn-copiar-texto">
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Texto
                      </Button>
                      <Button onClick={copiarImagem} variant="outline" size="lg" data-testid="btn-copiar-imagem">
                        <Download className="w-4 h-4 mr-2" />
                        Copiar Imagem
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Espelho da Simulação */}
                <Card ref={simulacaoRef} className="shadow-2xl" data-testid="espelho-simulacao">
                  <CardHeader className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white">
                    <CardTitle className="text-2xl text-center" data-testid="espelho-title">ESPELHO DA SIMULAÇÃO</CardTitle>
                    <CardDescription className="text-blue-100 text-center" data-testid="espelho-subtitle">
                      {nomeCliente || 'Cliente não informado'} • {tipoBeneficio}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Resumo Geral */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-600" data-testid="label-valor-liberado">Valor Liberado</p>
                              <p className="text-2xl font-bold text-green-700" data-testid="valor-liberado">
                                R$ {simulacao.valor_total_liberado.toFixed(2)}
                              </p>
                            </div>
                            <DollarSign className="w-10 h-10 text-green-600 opacity-20" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-600" data-testid="label-economia-mensal">Economia Mensal</p>
                              <p className="text-2xl font-bold text-blue-700" data-testid="economia-mensal">
                                R$ {simulacao.economia_total_mensal.toFixed(2)}
                              </p>
                            </div>
                            <TrendingDown className="w-10 h-10 text-blue-600 opacity-20" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-600" data-testid="label-nova-parcela">Nova Parcela Total</p>
                              <p className="text-2xl font-bold text-purple-700" data-testid="nova-parcela-total">
                                R$ {simulacao.nova_parcela_total.toFixed(2)}
                              </p>
                            </div>
                            <Banknote className="w-10 h-10 text-purple-600 opacity-20" />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-600" data-testid="label-margem-restante">Margem Restante</p>
                              <p className="text-2xl font-bold text-orange-700" data-testid="margem-restante">
                                R$ {simulacao.margem_restante.toFixed(2)}
                              </p>
                            </div>
                            <Calculator className="w-10 h-10 text-orange-600 opacity-20" />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Separator />

                    {/* Portabilidades */}
                    {simulacao.portabilidades.length > 0 && (
                      <div data-testid="portabilidades-section">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2" data-testid="portabilidades-title">
                          <TrendingDown className="w-5 h-5" />
                          Portabilidades ({simulacao.portabilidades.length})
                        </h3>
                        <div className="space-y-3">
                          {simulacao.portabilidades.map((p, idx) => (
                            <Card key={idx} className="border-l-4 border-l-blue-500" data-testid={`portabilidade-item-${idx}`}>
                              <CardContent className="pt-4">
                                <div className="grid md:grid-cols-3 gap-4">
                                  <div>
                                    <p className="text-xs text-gray-600">Banco Origem</p>
                                    <p className="font-semibold text-sm" data-testid={`port-banco-${idx}`}>{p.banco_origem}</p>
                                    <p className="text-xs text-gray-500" data-testid={`port-contrato-${idx}`}>{p.contrato}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Saldo / Taxa</p>
                                    <p className="font-semibold text-sm" data-testid={`port-saldo-${idx}`}>R$ {p.saldo_devedor.toFixed(2)}</p>
                                    <p className="text-xs" data-testid={`port-taxa-${idx}`}>{p.taxa_antiga}% → {p.taxa_nova}%</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600">Parcela / Economia</p>
                                    <p className="font-semibold text-sm" data-testid={`port-parcela-${idx}`}>R$ {p.parcela_antiga.toFixed(2)} → R$ {p.parcela_nova.toFixed(2)}</p>
                                    <Badge className="mt-1 bg-green-100 text-green-800" data-testid={`port-economia-${idx}`}>
                                      -R$ {p.economia_mensal.toFixed(2)}/mês
                                    </Badge>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Informações Adicionais */}
                    <div className="bg-gradient-to-r from-slate-50 to-gray-50 p-6 rounded-lg">
                      <h4 className="font-semibold mb-3" data-testid="info-adicionais-title">Informações Adicionais</h4>
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Banco Destino:</span>
                          <span className="ml-2 font-semibold" data-testid="info-banco-destino">
                            {bancos.find(b => b.codigo === bancoSelecionado)?.nome || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Prazo:</span>
                          <span className="ml-2 font-semibold" data-testid="info-prazo">{prazo} meses</span>
                        </div>
                        <div>
                          <span className="text-gray-600">CET Aproximado:</span>
                          <span className="ml-2 font-semibold" data-testid="info-cet">{simulacao.cet_aproximado.toFixed(2)}% a.a.</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Tipo Benefício:</span>
                          <span className="ml-2 font-semibold" data-testid="info-tipo-beneficio">{tipoBeneficio}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-center text-xs text-gray-500 pt-4" data-testid="disclaimer">
                      * Valores aproximados. Sujeito à aprovação do banco.
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Tab 4: Configuração */}
          <TabsContent value="configuracao" data-testid="content-configuracao">
            <div className="space-y-6">
              {/* Margens */}
              <Card className="shadow-xl">
                <CardHeader>
                  <CardTitle data-testid="config-margens-title">Configuração de Margens Consignáveis</CardTitle>
                  <CardDescription data-testid="config-margens-description">Ajuste os percentuais de margem para INSS e SIAPE</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="percentual-inss" data-testid="label-percentual-inss">Percentual INSS (%)</Label>
                      <Input
                        id="percentual-inss"
                        data-testid="input-percentual-inss"
                        type="number"
                        step="0.1"
                        value={percentualINSS}
                        onChange={(e) => setPercentualINSS(e.target.value)}
                      />
                      <p className="text-xs text-gray-500">Padrão: 35%</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="percentual-siape" data-testid="label-percentual-siape">Percentual SIAPE (%)</Label>
                      <Input
                        id="percentual-siape"
                        data-testid="input-percentual-siape"
                        type="number"
                        step="0.1"
                        value={percentualSIAPE}
                        onChange={(e) => setPercentualSIAPE(e.target.value)}
                      />
                      <p className="text-xs text-gray-500">Padrão: 35%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bancos */}
              <Card className="shadow-xl">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle data-testid="config-bancos-title">Configuração de Bancos e Taxas</CardTitle>
                      <CardDescription data-testid="config-bancos-description">Ajuste as taxas de cada banco</CardDescription>
                    </div>
                    {!editandoBancos ? (
                      <Button onClick={iniciarEdicaoBancos} variant="outline" data-testid="btn-editar-bancos">
                        Editar Taxas
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button onClick={salvarBancos} size="sm" data-testid="btn-salvar-bancos">
                          Salvar
                        </Button>
                        <Button onClick={() => setEditandoBancos(false)} variant="outline" size="sm" data-testid="btn-cancelar-edicao">
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(editandoBancos ? bancosEditados : bancos).map((banco, idx) => (
                      <Card key={banco.codigo} className="bg-slate-50" data-testid={`banco-config-${idx}`}>
                        <CardContent className="pt-4">
                          <h4 className="font-semibold mb-3" data-testid={`banco-nome-${idx}`}>{banco.nome}</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs" data-testid={`label-taxa-port-${idx}`}>Taxa Portabilidade (%)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={banco.taxa_portabilidade}
                                onChange={(e) => editandoBancos && atualizarTaxaBanco(banco.codigo, 'taxa_portabilidade', e.target.value)}
                                disabled={!editandoBancos}
                                data-testid={`input-taxa-port-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" data-testid={`label-taxa-refin-${idx}`}>Taxa Refin (%)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={banco.taxa_refin}
                                onChange={(e) => editandoBancos && atualizarTaxaBanco(banco.codigo, 'taxa_refin', e.target.value)}
                                disabled={!editandoBancos}
                                data-testid={`input-taxa-refin-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" data-testid={`label-taxa-novo-${idx}`}>Taxa Novo (%)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={banco.taxa_novo}
                                onChange={(e) => editandoBancos && atualizarTaxaBanco(banco.codigo, 'taxa_novo', e.target.value)}
                                disabled={!editandoBancos}
                                data-testid={`input-taxa-novo-${idx}`}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
