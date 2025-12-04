import React, { useState, useEffect, useCallback } from 'react';
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
import { Calculator, TrendingUp, TrendingDown, Copy, Settings } from 'lucide-react';
import html2canvas from 'html2canvas';

const BACKEND_URL = process.env.REACT_APP_API_URL;
const API = `${BACKEND_URL}/api`;

// Função para formatar valores em padrão brasileiro
const formatarMoeda = (valor) => {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
  const [contratosExcluidos, setContratosExcluidos] = useState(new Set());
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [taxaNovo, setTaxaNovo] = useState(() => localStorage.getItem('taxaNovo') || '1.80');
  const [taxaRefin, setTaxaRefin] = useState(() => localStorage.getItem('taxaRefin') || '1.50');
  const [taxaPortabilidade, setTaxaPortabilidade] = useState(() => localStorage.getItem('taxaPortabilidade') || '1.50');

  // Adiciona CSS para esconder botões e coluna 'Incluir' só na captura
  useEffect(() => {
    if (!document.getElementById('print-espelho-style')) {
      const style = document.createElement('style');
      style.id = 'print-espelho-style';
      style.innerHTML = `
        .print-espelho .btn-copiar-simulacao,
        .print-espelho .btn-copiar-imagem,
        .print-espelho th:first-child,
        .print-espelho td:first-child {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Carrega bancos ao iniciar
  useEffect(() => {
    const carregarBancos = async () => {
      try {
        const response = await axios.get(`${API}/bancos`);
        const bancosData = response.data;
        setBancos(bancosData);
        
        // Define Banrisul como padrão se existir, senão pega o primeiro
        const banrisul = bancosData.find(b => b.nome.toLowerCase().includes('banrisul'));
        if (banrisul) {
          setBancoSelecionado(banrisul.codigo);
        } else if (bancosData.length > 0) {
          setBancoSelecionado(bancosData[0].codigo);
        }
      } catch (error) {
        toast.error('Erro ao carregar bancos');
      }
    };
    
    carregarBancos();
  }, []);

  // Calcula valor liberado aproximado baseado na parcela e prazo
  const calcularValorLiberadoAproximado = () => {
    if (!parcela) return 0;

    const taxa = parseFloat(taxaNovo) / 100;
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
        texto: textoContratos,
        taxa_novo: parseFloat(taxaNovo),
        taxa_refin: parseFloat(taxaRefin),
        taxa_portabilidade: parseFloat(taxaPortabilidade)
      });

      const contratos = response.data;
      
      if (!contratos || contratos.length === 0) {
        return;
      }

      const taxaRefinCalc = parseFloat(taxaRefin) / 100;
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
        const vpNovo = parcelaAtual * ((1 - Math.pow(1 + taxaRefinCalc, -prazoNovo)) / taxaRefinCalc);
        
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
      // Filtro: apenas contratos com parcela > 100 OU saldo devedor > 4000
      const liberam = contratosProcessados.filter(c => 
        c.valorDisponivel > 0 && (c.parcelaAtual > 100 || c.saldoDevedor > 4000)
      );
      const naoLiberam = contratosProcessados.filter(c => 
        c.valorDisponivel <= 0 || (c.parcelaAtual <= 100 && c.saldoDevedor <= 4000)
      );

      setContratosLiberam(liberam);
      setContratosNaoLiberam(naoLiberam);

      // Calcula valor total liberado (excluindo contratos desmarcados)
      const totalLiberado = liberam
        .filter((c, idx) => !contratosExcluidos.has(`libera-${idx}`))
        .reduce((sum, c) => sum + c.valorDisponivel, 0);
      setValorLiberadoTotal(totalLiberado);

      toast.success(`${contratos.length} contrato(s) processado(s)`);
    } catch (error) {
      console.error('Erro ao processar contratos:', error);
      toast.error('Erro ao processar contratos');
    }
  }, [textoContratos, taxaNovo, taxaRefin, taxaPortabilidade, contratosExcluidos]);

  // Processa contratos automaticamente quando o texto muda
  useEffect(() => {
    const processarAutomaticamente = async () => {
      if (textoContratos.trim()) {
        await processarContratos();
      } else {
        setContratosLiberam([]);
        setContratosNaoLiberam([]);
        setValorLiberadoTotal(0);
      }
    };
    
    processarAutomaticamente();
  }, [textoContratos, bancoSelecionado, bancos, processarContratos]);

  // Função para copiar simulação formatada
  const copiarSimulacao = () => {
    if (contratosLiberam.length === 0) {
      toast.error('Nenhum contrato disponível para copiar');
      return;
    }

    const bancoDestino = bancos.find(b => b.codigo === bancoSelecionado);
    const nomeBanco = bancoDestino ? bancoDestino.nome : 'Banco XP';

    let texto = `*Portabilidade para o ${nomeBanco} – Renovação em 96 meses!*\n\n`;
    texto += `📅 *Prazo para pagamento: Até 10 dias úteis*\n\n`;

    const contratosIncluidos = contratosLiberam.filter((c, idx) => !contratosExcluidos.has(`libera-${idx}`));

    contratosIncluidos.forEach((contrato, index) => {
      texto += `🔹 ${contrato.banco.toUpperCase()}\n`;
      texto += `▫️ Parcela: R$ ${formatarMoeda(contrato.parcelaAtual)}\n`;
      texto += `▫️ *Valor liberado aproximado: R$ ${formatarMoeda(contrato.valorDisponivel)}*\n`;
      if (index < contratosIncluidos.length - 1) {
        texto += `\n`;
      }
    });

    texto += `\n💵 *Total aproximado disponível: R$ ${formatarMoeda(valorLiberadoTotal)}*`;

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Simulação copiada para a área de transferência!');
    }).catch(() => {
      toast.error('Erro ao copiar simulação');
    });
  };

  // Função para toggle incluir/excluir contrato do cálculo
  const toggleContratoExcluido = (id) => {
    setContratosExcluidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Função para copiar simulação de margem livre
  const copiarSimulacaoMargem = () => {
    if (!parcela || !prazo) {
      toast.error('Preencha a parcela e o prazo');
      return;
    }

    const valorLiberado = calcularValorLiberadoAproximado();
    const bancoDestino = bancos.find(b => b.codigo === bancoSelecionado);
    const nomeBanco = bancoDestino ? bancoDestino.nome : 'Banco';

    let texto = `*Simulação de Margem Livre*\n\n`;
    texto += `💵 *Parcela:* R$ ${formatarMoeda(parseFloat(parcela))}\n`;
    texto += `📅 *Prazo:* ${prazo} meses\n`;
    texto += `🟢 *Valor Liberado Aproximado: R$ ${formatarMoeda(valorLiberado)}*`;

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Simulação de margem copiada!');
    }).catch(() => {
      toast.error('Erro ao copiar simulação');
    });
  };

  // Função para copiar imagem do espelho da oferta sem botões e sem coluna 'Incluir'
  const copiarImagemEspelho = () => {
    const wrapper = document.getElementById('espelho-oferta');
    if (!wrapper) {
      toast.error('Tabela não encontrada!');
      return;
    }
    wrapper.classList.add('print-espelho');
    html2canvas(wrapper, { backgroundColor: '#fff', scale: 2 }).then(canvas => {
      wrapper.classList.remove('print-espelho');
      canvas.toBlob(blob => {
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([
            new window.ClipboardItem({ 'image/png': blob })
          ]).then(() => {
            toast.success('Imagem copiada!');
          }).catch(() => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'oferta.png';
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Imagem baixada!');
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'oferta.png';
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Imagem baixada!');
        }
      });
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-3">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent" data-testid="main-heading">
              Simulador de Crédito Consignado
            </h1>
            <Button
              onClick={() => setModalConfigAberto(true)}
              variant="outline"
              className="mt-2"
              data-testid="btn-config-taxas"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-gray-600 text-lg" data-testid="subtitle">Portabilidade • Refinanciamento • Margem Consignável</p>
        </div>

        {/* Modal de Configurações de Taxas */}
        {modalConfigAberto && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setModalConfigAberto(false)}>
            <Card className="w-full max-w-md mx-4 bg-white" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações de Taxas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="taxa-novo">Taxa NOVO (Margem) %</Label>
                  <Input
                    id="taxa-novo"
                    type="number"
                    step="0.001"
                    value={taxaNovo}
                    onChange={(e) => {
                      setTaxaNovo(e.target.value);
                      localStorage.setItem('taxaNovo', e.target.value);
                    }}
                    placeholder="Ex: 1.80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxa-refin">Taxa Refinanciamento %</Label>
                  <Input
                    id="taxa-refin"
                    type="number"
                    step="0.001"
                    value={taxaRefin}
                    onChange={(e) => {
                      setTaxaRefin(e.target.value);
                      localStorage.setItem('taxaRefin', e.target.value);
                    }}
                    placeholder="Ex: 1.50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxa-portabilidade">Taxa Portabilidade %</Label>
                  <Input
                    id="taxa-portabilidade"
                    type="number"
                    step="0.001"
                    value={taxaPortabilidade}
                    onChange={(e) => {
                      setTaxaPortabilidade(e.target.value);
                      localStorage.setItem('taxaPortabilidade', e.target.value);
                    }}
                    placeholder="Ex: 1.50"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => setModalConfigAberto(false)} className="flex-1">
                    Salvar
                  </Button>
                  <Button onClick={() => setModalConfigAberto(false)} variant="outline" className="flex-1">
                    Fechar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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
                    <SelectTrigger data-testid="select-prazo" className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
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
                    <SelectTrigger data-testid="select-banco-destino" className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
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
                    <div className="flex items-center gap-4">
                      <span className="text-3xl font-bold text-green-700" data-testid="valor-liberado-aproximado">
                        R$ {formatarMoeda(calcularValorLiberadoAproximado())}
                      </span>
                      <Button
                        onClick={copiarSimulacaoMargem}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        data-testid="btn-copiar-margem"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Simulação
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
              <div id="espelho-oferta">
              <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center gap-2" data-testid="contratos-liberam-title">
                    <TrendingUp className="w-6 h-6" />
                    Contratos que LIBERAM crédito
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold" data-testid="valor-total-liberado">
                      Total: R$ {formatarMoeda(valorLiberadoTotal)}
                    </span>
                    <Button 
                      onClick={copiarSimulacao}
                      className="bg-white text-green-700 hover:bg-green-50 font-semibold btn-copiar-simulacao"
                      data-testid="btn-copiar-simulacao"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar Simulação
                    </Button>
                    <Button
                      onClick={copiarImagemEspelho}
                      className="bg-white text-green-700 hover:bg-green-50 font-semibold btn-copiar-imagem"
                      data-testid="btn-copiar-imagem"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
                      Copiar Imagem
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="tabela-contratos-liberam">
                    <thead>
                      <tr className="border-b-2 border-green-300">
                        <th className="text-center py-3 px-2 font-semibold">Incluir</th>
                        <th className="text-left py-3 px-2 font-semibold">Banco</th>
                        <th className="text-left py-3 px-2 font-semibold">Nº Contrato</th>
                        <th className="text-right py-3 px-2 font-semibold">Parcela</th>
                        <th className="text-center py-3 px-2 font-semibold">Prazo Restante</th>
                        <th className="text-right py-3 px-2 font-semibold">Saldo Devedor</th>
                        <th className="text-right py-3 px-2 font-semibold">Valor Disponível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratosLiberam.map((c, idx) => {
                        const contratoId = `libera-${idx}`;
                        const isExcluido = contratosExcluidos.has(contratoId);
                        return (
                        <tr key={idx} className={`border-b hover:bg-green-50 ${isExcluido ? 'opacity-50' : ''}`} data-testid={`contrato-libera-${idx}`}>
                          <td className="py-3 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={!isExcluido}
                              onChange={() => toggleContratoExcluido(contratoId)}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-2" data-testid={`contrato-libera-banco-${idx}`}>{c.banco}</td>
                          <td className="py-3 px-2 font-mono text-xs" data-testid={`contrato-libera-numero-${idx}`}>{c.contrato}</td>
                          <td className="py-3 px-2 text-right text-purple-700 font-bold" data-testid={`contrato-libera-parcela-${idx}`}>
                            R$ {formatarMoeda(c.parcelaAtual)}
                          </td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-libera-prazo-restante-${idx}`}>{c.prazoRestante}</td>
                          <td className="py-3 px-2 text-right text-blue-700 font-semibold" data-testid={`contrato-libera-saldo-${idx}`}>
                            R$ {formatarMoeda(c.saldoDevedor)}
                          </td>
                          <td className="py-3 px-2 text-right text-green-700 font-bold" data-testid={`contrato-libera-valor-${idx}`}>
                            R$ {formatarMoeda(c.valorDisponivel)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
              </div>
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
                        <th className="text-right py-3 px-2 font-semibold">Parcela</th>
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
                          <td className="py-3 px-2 text-right text-purple-700 font-bold" data-testid={`contrato-nao-libera-parcela-${idx}`}>
                            R$ {formatarMoeda(c.parcelaAtual)}
                          </td>
                          <td className="py-3 px-2 text-center" data-testid={`contrato-nao-libera-prazo-restante-${idx}`}>{c.prazoRestante}</td>
                          <td className="py-3 px-2 text-right text-blue-700 font-semibold" data-testid={`contrato-nao-libera-saldo-${idx}`}>
                            R$ {formatarMoeda(c.saldoDevedor)}
                          </td>
                          <td className="py-3 px-2 text-red-700 text-sm" data-testid={`contrato-nao-libera-motivo-${idx}`}>
                            {c.valorDisponivel <= 0 
                              ? 'Não libera (Valor Negativo)'
                              : 'Parcela abaixo do minimo'
                            }
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
