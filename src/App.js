import React, { useState, useEffect, useCallback } from 'react';
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

const BACKEND_URL = process.env.REACT_APP_API_URL;
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
    
    carregarBancos();
  }, []);

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

  // Processa contratos
  const processarContratos = useCallback(async () => {
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
  }, [bancoSelecionado, bancos, textoContratos]);

  // Processa contratos automaticamente quando o texto muda
  useEffect(() => {
    const processarAutomaticamente = async () => {
      if (textoContratos.trim() && bancoSelecionado && bancos.length > 0) {
        await processarContratos();
      } else {
        setContratosLiberam([]);
        setContratosNaoLiberam([]);
        setValorLiberadoTotal(0);
      }
    };
    
    processarAutomaticamente();
  }, [textoContratos, bancoSelecionado, bancos, processarContratos]);

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
        </div>
      </div>
    </div>
  );
}

export default App;
