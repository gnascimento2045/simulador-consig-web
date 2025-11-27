import React, { useState, useEffect } from 'react';
import { vp } from './lib/utils';
import './App.css';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Calculator, TrendingUp, TrendingDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [nomeCliente, setNomeCliente] = useState('');
  const [parcela, setParcela] = useState('');
  const [prazo, setPrazo] = useState('96');
  const [margemDisponivel, setMargemDisponivel] = useState('');
  const [valorDesejado, setValorDesejado] = useState('');
  const [textoContratos, setTextoContratos] = useState('');
  const [bancos, setBancos] = useState([]);
  const [bancoSelecionado, setBancoSelecionado] = useState('');
  const [contratosLiberam, setContratosLiberam] = useState([]);
  const [contratosNaoLiberam, setContratosNaoLiberam] = useState([]);
  const [valorLiberadoTotal, setValorLiberadoTotal] = useState(0);

  // Carrega bancos ao iniciar
  useEffect(() => {
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

  // Calcula valor liberado aproximado baseado na parcela e prazo
  const calcularValorLiberadoAproximado = () => {
    if (!parcela || !bancoSelecionado) return 0;
    const banco = bancos.find(b => b.codigo === bancoSelecionado);
    if (!banco) return 0;

    const taxa = banco.taxa_refin / 100;
    const n = parseInt(prazo);
    const parcelaNum = parseFloat(parcela);
    
    // VP = PMT × [(1 - (1 + i)^-n) / i]
    const valorLiberado = parcelaNum * ((1 - Math.pow(1 + taxa, -n)) / taxa);
    return valorLiberado;
  };

  // Processa contratos automaticamente quando o texto muda
  useEffect(() => {
    if (textoContratos.trim()) {
      processarContratos();
    } else {
      setContratosLiberam([]);
      setContratosNaoLiberam([]);
      setValorLiberadoTotal(0);
    }
  }, [textoContratos, bancoSelecionado, bancos]);

  const processarContratos = async () => {
    try {
      const response = await axios.post(`${API}/parse-contratos`, {
        texto: textoContratos
      });

      const contratos = response.data;
      
      if (!contratos || contratos.length === 0) {
        return;
      }

      const bancoDestino = bancos.find(b => b.codigo === bancoSelecionado);
      if (!bancoDestino) return;

      const taxaRefin = bancoDestino.taxa_refin / 100;
      const prazoNovo = 96; // Sempre 96 meses conforme especificação

      const contratosProcessados = contratos.map(c => {
        // Calcula parcelas restantes
        let parcelasRestantes;
        if (c.parcelas_total && c.parcelas_pagas) {
          parcelasRestantes = parseInt(c.parcelas_total) - parseInt(c.parcelas_pagas);
        } else if (c.parcelas_restantes) {
          parcelasRestantes = parseInt(c.parcelas_restantes);
        } else {
          parcelasRestantes = null;
        }

        // Pega saldo devedor (quitação)
        let saldoDevedor = 0;
        if (c.quitacao) {
          saldoDevedor = parseFloat(String(c.quitacao).replace(/[^\d.,]/g, '').replace(',', '.'));
        } else if (c.saldo_devedor) {
          saldoDevedor = parseFloat(c.saldo_devedor);
        }

        const parcelaAtual = parseFloat(c.valor_parcela) || 0;
        
        // Calcula VP do novo contrato (96 meses, taxa refin, mantém a parcela)
        // VP = PMT × [(1 - (1 + i)^-n) / i]
        const vpNovo = parcelaAtual * ((1 - Math.pow(1 + taxaRefin, -prazoNovo)) / taxaRefin);
        
        // Valor disponível/liberado = VP novo - Saldo devedor
        const valorDisponivel = vpNovo - saldoDevedor;

        return {
          banco: c.banco,
          contrato: c.contrato,
          prazoTotal: c.parcelas_total || '—',
          prazoRestante: parcelasRestantes || '—',
          saldoDevedor: saldoDevedor,
          valorDisponivel: valorDisponivel,
          parcelaAtual: parcelaAtual,
          vpNovo: vpNovo
        };
      });

      // Separa contratos que liberam e não liberam
      const liberam = contratosProcessados.filter(c => c.valorDisponivel > 0);
      const naoLiberam = contratosProcessados.filter(c => c.valorDisponivel <= 0);

      setContratosLiberam(liberam);
      setContratosNaoLiberam(naoLiberam);

      // Calcula valor total liberado
      const totalLiberado = liberam.reduce((sum, c) => sum + c.valorDisponivel, 0);
      setValorLiberadoTotal(totalLiberado);

      toast.success(`${contratos.length} contrato(s) processado(s)`);
    } catch (error) {
      console.error('Erro ao processar contratos:', error);
      toast.error('Erro ao processar contratos');
    }
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

        <div className="space-y-6">
          {/* Seção 1: Nome do Cliente */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg" data-testid="nome-cliente-title">Nome do Cliente (Opcional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                data-testid="input-nome-cliente"
                placeholder="Digite o nome do cliente para aparecer no espelho"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
                className="text-lg"
              />
            </CardContent>
          </Card>

          {/* Seção 2: Simulação de Margem */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-center" data-testid="simulacao-margem-title">
                SIMULAÇÃO DE MARGEM
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="parcela" data-testid="label-parcela">Parcela (R$)</Label>
                  <Input
                    id="parcela"
                    data-testid="input-parcela"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 35,38"
                    value={parcela}
                    onChange={(e) => setParcela(e.target.value)}
                    className="text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prazo" data-testid="label-prazo">Prazo</Label>
                  <Select value={prazo} onValueChange={setPrazo}>
                    <SelectTrigger data-testid="select-prazo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="96" data-testid="option-prazo-96">96 meses</SelectItem>
                      <SelectItem value="84" data-testid="option-prazo-84">84 meses</SelectItem>
                      <SelectItem value="72" data-testid="option-prazo-72">72 meses</SelectItem>
                      <SelectItem value="60" data-testid="option-prazo-60">60 meses</SelectItem>
                      <SelectItem value="48" data-testid="option-prazo-48">48 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="banco-destino" data-testid="label-banco-destino">Banco Destino</Label>
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

              {/* Valor Liberado Aproximado */}
              {parcela && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-2 border-green-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-8 h-8 text-green-600" />
                      <span className="text-lg font-medium text-gray-700">Valor Liberado Aproximado:</span>
                    </div>
                    <span className="text-3xl font-bold text-green-700" data-testid="valor-liberado-aproximado">
                      R$ {calcularValorLiberadoAproximado().toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Opções: Margem ou Valor Desejado */}
              <div className="grid md:grid-cols-2 gap-6 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="margem" data-testid="label-margem">Informe a Margem (opcional)</Label>
                  <Input
                    id="margem"
                    data-testid="input-margem"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 500,00"
                    value={margemDisponivel}
                    onChange={(e) => setMargemDisponivel(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valor-desejado" data-testid="label-valor-desejado">OU Informe o Valor Desejado</Label>
                  <Input
                    id="valor-desejado"
                    data-testid="input-valor-desejado"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 10.000,00"
                    value={valorDesejado}
                    onChange={(e) => setValorDesejado(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seção 3: Cole seus Contratos */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2" data-testid="contratos-title">
                <Calculator className="w-5 h-5" />
                Cole seus Contratos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                data-testid="textarea-contratos"
                placeholder="Cole aqui os contratos existentes...

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
                className="min-h-[300px] font-mono text-sm"
                value={textoContratos}
                onChange={(e) => setTextoContratos(e.target.value)}
              />
              <p className="text-sm text-gray-500 mt-2">
                * Os contratos serão processados automaticamente ao colar
              </p>
            </CardContent>
          </Card>

          {/* Seção 4: Contratos que LIBERAM crédito */}
          {contratosLiberam.length > 0 && (
            <Card className="shadow-xl border-green-400">
              <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center gap-2" data-testid="contratos-liberam-title">
                    <TrendingUp className="w-6 h-6" />
                    Contratos que LIBERAM crédito
                  </CardTitle>
                  <span className="text-2xl font-bold" data-testid="valor-total-liberado">
                    Total: R$ {valorLiberadoTotal.toFixed(2)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="tabela-contratos-liberam">
                    <thead>
                      <tr className="border-b-2 border-green-300">
                        <th className="text-left py-3 px-2 font-semibold">Banco</th>
                        <th className="text-left py-3 px-2 font-semibold">Nº Contrato</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Total</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Restante</th>
                        <th className="text-right py-3 px-2 font-semibold">Saldo Devedor</th>
                        <th className="text-right py-3 px-2 font-semibold">Valor Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratosLiberam.map((c, idx) => (
                        <tr key={idx} className="border-b hover:bg-green-50" data-testid={`contrato-libera-${idx}`}>
                          <td className="py-3 px-2" data-testid={`contrato-libera-banco-${idx}`}>{c.banco}</td>
                          <td className="py-3 px-2 font-mono text-xs" data-testid={`contrato-libera-numero-${idx}`}>{c.contrato}</td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-libera-prazo-total-${idx}`}>{c.prazoTotal}</td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-libera-prazo-restante-${idx}`}>{c.prazoRestante}</td>
                          <td className="py-3 px-2 text-right text-blue-700 font-semibold" data-testid={`contrato-libera-saldo-${idx}`}>
                            R$ {c.saldoDevedor.toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-right text-green-700 font-bold" data-testid={`contrato-libera-valor-${idx}`}>
                            R$ {c.valorDisponivel.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Seção 5: Contratos que NÃO LIBERAM crédito */}
          {contratosNaoLiberam.length > 0 && (
            <Card className="shadow-xl border-red-400">
              <CardHeader className="bg-gradient-to-r from-red-600 to-rose-600 text-white">
                <CardTitle className="text-xl flex items-center gap-2" data-testid="contratos-nao-liberam-title">
                  <TrendingDown className="w-6 h-6" />
                  Contratos que NÃO LIBERAM crédito
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="tabela-contratos-nao-liberam">
                    <thead>
                      <tr className="border-b-2 border-red-300">
                        <th className="text-left py-3 px-2 font-semibold">Banco</th>
                        <th className="text-left py-3 px-2 font-semibold">Nº Contrato</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Total</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Restante</th>
                        <th className="text-right py-3 px-2 font-semibold">Saldo Devedor</th>
                        <th className="text-left py-3 px-2 font-semibold">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratosNaoLiberam.map((c, idx) => (
                        <tr key={idx} className="border-b hover:bg-red-50" data-testid={`contrato-nao-libera-${idx}`}>
                          <td className="py-3 px-2" data-testid={`contrato-nao-libera-banco-${idx}`}>{c.banco}</td>
                          <td className="py-3 px-2 font-mono text-xs" data-testid={`contrato-nao-libera-numero-${idx}`}>{c.contrato}</td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-nao-libera-prazo-total-${idx}`}>{c.prazoTotal}</td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-nao-libera-prazo-restante-${idx}`}>{c.prazoRestante}</td>
                          <td className="py-3 px-2 text-right text-blue-700 font-semibold" data-testid={`contrato-nao-libera-saldo-${idx}`}>
                            R$ {c.saldoDevedor.toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-red-700" data-testid={`contrato-nao-libera-motivo-${idx}`}>
                            Saldo devedor maior que VP novo (R$ {c.vpNovo.toFixed(2)})
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

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
                            {/* NOVO: Exibe resultado das portabilidades/refinanciamentos logo após parse */}
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                              <Card className="border-green-400">
                                <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                                  <CardTitle className="text-lg text-center">Parcelas que liberam crédito</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                  {parcelasLiberam.length > 0 ? (
                                    <div className="space-y-3">
                                      {parcelasLiberam.map((p, idx) => (
                                        <Card key={idx} className="border-l-4 border-l-green-500 bg-green-50">
                                          <CardContent className="pt-2">
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                              <div>
                                                <span className="text-gray-600">Banco Origem:</span>
                                                <p className="font-semibold">{p.banco}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Contrato:</span>
                                                <p className="font-semibold">{p.contrato}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Saldo Devedor:</span>
                                                <p className="font-semibold text-blue-700">R$ {p.saldo_devedor?.toFixed(2)}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Valor Liberado:</span>
                                                <p className="font-semibold text-green-700">R$ {p.valorLiberado?.toFixed(2)}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Prazo Restante:</span>
                                                <p className="font-semibold">{p.prazoRestante !== null ? `${p.prazoRestante} meses` : 'N/A'}</p>
                                              </div>
                                            </div>
                                          </CardContent>
                                        </Card>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center text-green-700">Nenhuma parcela libera crédito.</div>
                                  )}
                                </CardContent>
                              </Card>
                              <Card className="border-red-400">
                                <CardHeader className="bg-gradient-to-r from-red-600 to-rose-600 text-white">
                                  <CardTitle className="text-lg text-center">Parcelas que NÃO liberam crédito</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                  {parcelasNaoLiberam.length > 0 ? (
                                    <div className="space-y-3">
                                      {parcelasNaoLiberam.map((p, idx) => (
                                        <Card key={idx} className="border-l-4 border-l-red-500 bg-red-50">
                                          <CardContent className="pt-2">
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                              <div>
                                                <span className="text-gray-600">Banco Origem:</span>
                                                <p className="font-semibold">{p.banco}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Contrato:</span>
                                                <p className="font-semibold">{p.contrato}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Saldo Devedor:</span>
                                                <p className="font-semibold text-blue-700">R$ {p.saldo_devedor?.toFixed(2)}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Valor Liberado:</span>
                                                <p className="font-semibold text-red-700">R$ {p.valorLiberado?.toFixed(2)}</p>
                                              </div>
                                              <div>
                                                <span className="text-gray-600">Prazo Restante:</span>
                                                <p className="font-semibold">{p.prazoRestante !== null ? `${p.prazoRestante} meses` : 'N/A'}</p>
                                              </div>
                                            </div>
                                          </CardContent>
                                        </Card>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center text-red-700">Todas as parcelas liberam crédito.</div>
                                  )}
                                </CardContent>
                              </Card>
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

                        {/* NOVO: Parcelas que liberam crédito */}
                        <Card className="shadow-2xl border-green-400">
                          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                            <CardTitle className="text-xl text-center">Parcelas que liberam crédito</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            {parcelasLiberam.length > 0 ? (
                              <div className="space-y-3">
                                {parcelasLiberam.map((p, idx) => (
                                  <Card key={idx} className="border-l-4 border-l-green-500 bg-green-50">
                                    <CardContent className="pt-4">
                                      <div className="grid md:grid-cols-5 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-600">Banco Origem:</span>
                                          <p className="font-semibold">{p.banco_origem}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Contrato:</span>
                                          <p className="font-semibold">{p.contrato}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Saldo Devedor:</span>
                                          <p className="font-semibold text-blue-700">R$ {p.saldo_devedor.toFixed(2)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Valor Liberado:</span>
                                          <p className="font-semibold text-green-700">R$ {p.valorLiberado.toFixed(2)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Prazo Restante:</span>
                                          <p className="font-semibold">{p.prazoRestante} meses</p>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center text-green-700">Nenhuma parcela libera crédito.</div>
                            )}
                          </CardContent>
                        </Card>

                        {/* NOVO: Parcelas que NÃO liberam crédito */}
                        <Card className="shadow-2xl border-red-400">
                          <CardHeader className="bg-gradient-to-r from-red-600 to-rose-600 text-white">
                            <CardTitle className="text-xl text-center">Parcelas que NÃO liberam crédito</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                            {parcelasNaoLiberam.length > 0 ? (
                              <div className="space-y-3">
                                {parcelasNaoLiberam.map((p, idx) => (
                                  <Card key={idx} className="border-l-4 border-l-red-500 bg-red-50">
                                    <CardContent className="pt-4">
                                      <div className="grid md:grid-cols-5 gap-4 text-sm">
                                        <div>
                                          <span className="text-gray-600">Banco Origem:</span>
                                          <p className="font-semibold">{p.banco_origem}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Contrato:</span>
                                          <p className="font-semibold">{p.contrato}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Saldo Devedor:</span>
                                          <p className="font-semibold text-blue-700">R$ {p.saldo_devedor.toFixed(2)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Valor Liberado:</span>
                                          <p className="font-semibold text-red-700">R$ {p.valorLiberado.toFixed(2)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-600">Prazo Restante:</span>
                                          <p className="font-semibold">{p.prazoRestante} meses</p>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center text-red-700">Todas as parcelas liberam crédito.</div>
                            )}
                          </CardContent>
                        </Card>

                        {/* ...existing code... (Espelho da Simulação, Informações Adicionais, etc) */}
                        <Card ref={simulacaoRef} className="shadow-2xl" data-testid="espelho-simulacao">
                          {/* ...existing code... */}
                          <CardHeader className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white">
                            <CardTitle className="text-2xl text-center" data-testid="espelho-title">ESPELHO DA SIMULAÇÃO</CardTitle>
                            <CardDescription className="text-blue-100 text-center" data-testid="espelho-subtitle">
                              {nomeCliente || 'Cliente não informado'} • {tipoBeneficio}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pt-6 space-y-6">
                            {/* ...existing code... */}
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
